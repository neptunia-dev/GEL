import { describe, expect, it } from "vitest";
import {
  LuaApi,
  LuaRuntime,
  type LuaApiHost,
  type LuaPresentationCommand,
  type LuaRequest,
  type LuaState,
} from "../src/lua";
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
    const variables: Record<string, any> = {};

    const result = await runtime.run(
      script,
      async (request) => {
        requests.push(request);
        return request.type === "choice" ? "accept" : undefined;
      },
      { sourceName: "prologue.lua", variables },
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
    const variables = { score: 4 };
    const result = await runtime.run(
      `return function(ctx)
        ctx.state:set("seen", ctx.state:get("score", 0) + 1)
        return ctx.flow:end_story()
      end`,
      () => undefined,
      { variables },
    );

    expect(result).toEqual({ type: "end" });
    expect(variables).toEqual({ score: 4, seen: 5 });
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
        { sourceName: "loop.lua", sandbox: { instructionLimit: 1000 } },
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
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("reports Lua errors with the source name", () => {
    const runtime = new LuaRuntime();
    expect(() => runtime.create(`return function(ctx) error("broken") end`, { sourceName: "broken.lua" }).start()).toThrow(
      /broken\.lua/,
    );
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
        ctx.state:set("seen", true)
        return ctx.flow:exit("done")
      end`,
      async (request) => {
        requests.push(request);
        return undefined;
      },
      {
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
        { characterIds: ["alice"], exits: ["done"] },
      ),
    ).rejects.toThrow(/not declared in this scene/);

    await expect(
      runtime.run(
        `return function(ctx)
          return ctx.flow:exit("unknown")
        end`,
        () => undefined,
        { exits: ["done"] },
      ),
    ).rejects.toThrow(/does not declare exit port/);
  });

  it("allows a development API to self-register through one factory", async () => {
    const runtime = new LuaRuntime();
    const variables: Record<string, any> = {};
    const result = await runtime.run(
      `return function(ctx)
        ctx.debug:mark()
        return ctx.flow:end_story()
      end`,
      () => undefined,
      { variables, apiFactories: [(host) => new DebugApi(host)] },
    );

    expect(result).toEqual({ type: "end" });
    expect(variables["debug.marked"]).toBe(true);
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
        { sourceName: "debug.lua", apiFactories: [(host) => new DebugApi(host)] },
      ),
    ).rejects.toThrow(/ctx\.debug\.fail: 开发 API 参数错误 \[E_ARGUMENT\]/);
  });
});
