import { describe, expect, it } from "vitest";
import {
  LuaApi,
  LuaRuntime,
  type LuaApiHost,
  type LuaPresentationCommand,
  type LuaRequest,
  type LuaState,
} from "../src/lua";
import { GameState } from "../src/variables";

class DebugApi extends LuaApi {
  public readonly namespace = "debug";
  public readonly capability = "debug";

  public constructor(host: LuaApiHost) {
    super(host);
    this.expose("mark", "sync", this.mark);
    this.expose("fail", "sync", this.fail);
  }

  private mark(_state: LuaState): number {
    this.host.variables.set("debug.marked", true);
    return 0;
  }

  private fail(_state: LuaState): number {
    throw new TypeError("开发 API 参数错误");
  }
}

function createTestState(score = 0): GameState {
  const state = new GameState({
    packageId: "test.package",
    schemaVersion: 1,
    sceneId: "test.scene",
    variables: [
      { key: "alice.affection", schema: { type: "number" }, defaultValue: 0 },
      { key: "debug.marked", schema: { type: "boolean" }, defaultValue: false },
      { key: "flag.seen", schema: { type: "boolean" }, defaultValue: false },
      { key: "last.answer", schema: { type: "string" }, defaultValue: "" },
      { key: "score", schema: { type: "number" }, defaultValue: 0 },
      { key: "seen.value", schema: { type: "number" }, defaultValue: 0 },
      { key: "empty.list", schema: { type: "array", items: { type: "number" } }, defaultValue: [] },
      { key: "nested.list", schema: { type: "array", items: { type: "array", items: { type: "number" } } }, defaultValue: [] },
    ],
  });
  if (score !== 0) {
    state.variables.set("score", score);
  }
  return state;
}

const script = `
return function(ctx)
  ctx.dialogue:say("alice", "今天一起回家吗？")
  local answer = ctx.dialogue:choice({
    { id = "accept", text = "一起回家" },
    { id = "decline", text = "还有事情" }
  })
  ctx.state:add("alice.affection", 1)
  ctx.state:set("last.answer", answer)
  return ctx.flow:exit(answer)
end
`;

describe("LuaRuntime", () => {
  it("pauses on dialogue and choice, then returns a scene port", async () => {
    const requests: LuaRequest[] = [];
    const runtime = new LuaRuntime();
    const state = createTestState();

    const result = await runtime.run(
      script,
      async (request) => {
        requests.push(request);
        return request.type === "choice" ? "accept" : undefined;
      },
      { sourceName: "prologue.lua", state },
    );

    expect(result).toEqual({ type: "exit", port: "accept" });
    expect(requests).toEqual([
      { type: "dialogue", mode: "character", speaker: "alice", text: "今天一起回家吗？" },
      {
        type: "choice",
        options: [
          { id: "accept", text: "一起回家", enabled: true },
          { id: "decline", text: "还有事情", enabled: true },
        ],
      },
    ]);
  });

  it("supports state reads and writes", async () => {
    const runtime = new LuaRuntime();
    const state = createTestState(4);
    const result = await runtime.run(
      `return function(ctx)
        ctx.state:set("seen.value", ctx.state:get("score") + 1)
        return ctx.flow:end_story()
      end`,
      () => undefined,
      { state },
    );

    expect(result).toEqual({ type: "end" });
    expect(state.variables.get("score")).toBe(4);
    expect(state.variables.get("seen.value")).toBe(5);
  });

  it("keeps unsafe standard libraries out of the story sandbox", async () => {
    const runtime = new LuaRuntime();
    const result = await runtime.run(
      `return function(ctx)
        if io ~= nil or os ~= nil or package ~= nil or debug ~= nil then
          error("unsafe library exposed")
        end
        return ctx.flow:exit(math.floor(3.9) == 3 and "sandboxed" or "broken")
      end`,
      () => undefined,
      { state: createTestState() },
    );

    expect(result).toEqual({ type: "exit", port: "sandboxed" });
  });

  it("stops an infinite Lua loop with the instruction limit", () => {
    const runtime = new LuaRuntime();
    expect(() =>
      runtime.create(
        `return function(ctx)
          while true do end
        end`,
        { state: createTestState(), sourceName: "loop.lua", sandbox: { instructionLimit: 1000 } },
      ).start(),
    ).toThrow(/instruction limit exceeded/);
  });

  it("honors AbortSignal while waiting for a request", async () => {
    const runtime = new LuaRuntime();
    const controller = new AbortController();
    await expect(
      runtime.run(
        `return function(ctx)
          ctx.dialogue:narrate("wait")
          return ctx.flow:end_story()
        end`,
        async () => {
          controller.abort();
          return undefined;
        },
        { state: createTestState(), signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("reports Lua errors with the source name", () => {
    const runtime = new LuaRuntime();
    expect(() =>
      runtime.create(`return function(ctx) error("broken") end`, { state: createTestState(), sourceName: "broken.lua" }).start(),
    ).toThrow(/broken\.lua/);
  });

  it("supports namespaced dialogue, stage, state, time and flow APIs", async () => {
    const runtime = new LuaRuntime();
    const requests: LuaRequest[] = [];
    const commands: LuaPresentationCommand[] = [];

    const result = await runtime.run(
      `return function(ctx)
        ctx.stage:show("alice", { side = "left", expression = "smile" })
        ctx.stage:focus("alice")
        ctx.dialogue:say("alice", "欢迎回来。")
        ctx.dialogue:monologue("我应该怎么回答？")
        ctx.dialogue:narrate("走廊安静下来。")
        ctx.dialogue:offscreen("bob", "我在这里。")
        ctx.time:wait(0.25)
        ctx.state:set("flag.seen", true)
        return ctx.flow:exit("done")
      end`,
      async (request) => {
        requests.push(request);
        return undefined;
      },
      {
        state: createTestState(),
        characterIds: ["alice", "bob"],
        exits: ["done"],
        onPresentation: (event) => commands.push(event.command),
      },
    );

    expect(result).toEqual({ type: "exit", port: "done" });
    expect(requests).toEqual([
      { type: "dialogue", mode: "character", speaker: "alice", text: "欢迎回来。" },
      { type: "dialogue", mode: "monologue", speaker: null, text: "我应该怎么回答？" },
      { type: "dialogue", mode: "narration", speaker: null, text: "走廊安静下来。" },
      { type: "dialogue", mode: "offscreen", speaker: "bob", text: "我在这里。" },
      { type: "wait", seconds: 0.25 },
    ]);
    expect(commands).toEqual([
      { kind: "stage.show", characterId: "alice", side: "left", expression: "smile" },
      { kind: "stage.focus", characterId: "alice" },
    ]);
  });

  it("rejects invalid host choice responses before resuming Lua", async () => {
    const runtime = new LuaRuntime();
    await expect(
      runtime.run(
        `return function(ctx)
          ctx.dialogue:choice({ { id = "ok", text = "继续" } })
          return ctx.flow:end_story()
        end`,
        () => "missing",
        { state: createTestState() },
      ),
    ).rejects.toThrow(/Unknown or disabled choice option/);
  });

  it("keeps explicit choice enabled flags and rejects duplicate IDs", async () => {
    const runtime = new LuaRuntime();
    const requests: LuaRequest[] = [];
    await runtime.run(
      `return function(ctx)
        ctx.dialogue:choice({
          { id = "yes", text = "是", enabled = true },
          { id = "no", text = "否", enabled = false }
        })
        return ctx.flow:end_story()
      end`,
      (request) => {
        requests.push(request);
        return "yes";
      },
      { state: createTestState() },
    );
    expect(requests[0]).toMatchObject({
      type: "choice",
      options: [
        { id: "yes", enabled: true },
        { id: "no", enabled: false },
      ],
    });

    await expect(
      runtime.run(
        `return function(ctx)
          ctx.dialogue:choice({
            { id = "same", text = "A" },
            { id = "same", text = "B" }
          })
          return ctx.flow:end_story()
        end`,
        () => "same",
        { state: createTestState() },
      ),
    ).rejects.toThrow(/duplicate choice option id/);
  });

  it("validates declared characters and exit ports", async () => {
    const runtime = new LuaRuntime();
    await expect(
      runtime.run(
        `return function(ctx)
          ctx.stage:show("bob", { side = "right" })
          return ctx.flow:exit("unknown")
        end`,
        () => undefined,
        { state: createTestState(), characterIds: ["alice"], exits: ["done"] },
      ),
    ).rejects.toThrow(/not declared in this scene/);

    await expect(
      runtime.run(
        `return function(ctx)
          return ctx.flow:exit("unknown")
        end`,
        () => undefined,
        { state: createTestState(), exits: ["done"] },
      ),
    ).rejects.toThrow(/does not declare exit port/);

    await expect(
      runtime.run(
        `return function(ctx)
          return ctx.flow:exit("next")
        end`,
        () => undefined,
        { state: createTestState(), exits: [] },
      ),
    ).rejects.toThrow(/does not declare exit port/);
  });

  it("allows a development API to self-register through one factory", async () => {
    const runtime = new LuaRuntime();
    const state = createTestState();
    const result = await runtime.run(
      `return function(ctx)
        ctx.debug:mark()
        return ctx.flow:end_story()
      end`,
      () => undefined,
      { state, apiFactories: [(host) => new DebugApi(host)] },
    );

    expect(result).toEqual({ type: "end" });
    expect(state.variables.get("debug.marked")).toBe(true);
  });

  it("formats development API errors with a stable context path", async () => {
    const runtime = new LuaRuntime();
    await expect(
      runtime.run(
        `return function(ctx)
          ctx.debug:fail()
          return ctx.flow:end_story()
        end`,
        () => undefined,
        { state: createTestState(), sourceName: "debug.lua", apiFactories: [(host) => new DebugApi(host)] },
      ),
    ).rejects.toThrow(/ctx\.debug\.fail: 开发 API 参数错误 \[E_ARGUMENT\]/);
  });

  it("shares one GameState across runs and exposes reset without remove", async () => {
    const runtime = new LuaRuntime();
    const state = createTestState();

    await runtime.run(
      `return function(ctx)
        ctx.state:set("flag.seen", true)
        ctx.state:add("score", 2)
        assert(ctx.state:has("flag.seen"))
        return ctx.flow:end_story()
      end`,
      () => undefined,
      { state },
    );
    expect(state.variables.get("flag.seen")).toBe(true);
    expect(state.variables.get("score")).toBe(2);

    await runtime.run(
      `return function(ctx)
        assert(ctx.state:get("score") == 2)
        ctx.state:reset("flag.seen")
        assert(ctx.state:get("flag.seen") == false)
        return ctx.flow:end_story()
      end`,
      () => undefined,
      { state },
    );
    expect(state.variables.get("flag.seen")).toBe(false);

    await expect(
      runtime.run(
        `return function(ctx)
          ctx.state:remove("flag.seen")
          return ctx.flow:end_story()
        end`,
        () => undefined,
        { state },
      ),
    ).rejects.toThrow(/remove|nil value/);
  });

  it("decodes empty and nested Lua tables using the declared array schema", async () => {
    const runtime = new LuaRuntime();
    const state = createTestState();

    await runtime.run(
      `return function(ctx)
        ctx.state:set("empty.list", {})
        ctx.state:set("nested.list", {{}, { 1, 2 }})
        return ctx.flow:end_story()
      end`,
      () => undefined,
      { state },
    );

    expect(state.variables.get("empty.list")).toEqual([]);
    expect(state.variables.get("nested.list")).toEqual([[], [1, 2]]);
  });

  it("rejects Lua writes that violate the declared variable schema", async () => {
    const runtime = new LuaRuntime();
    const state = createTestState();

    await expect(
      runtime.run(
        `return function(ctx)
          ctx.state:set("score", "not a number")
          return ctx.flow:end_story()
        end`,
        () => undefined,
        { state },
      ),
    ).rejects.toThrow(/number/);
    expect(state.variables.get("score")).toBe(0);
  });
});
