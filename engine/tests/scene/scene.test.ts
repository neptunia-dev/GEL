import { describe, expect, it } from "vitest";
import { FileSystemError } from "../../src/filesystem";
import { Scene, type SceneDefinition } from "../../src/scene";

/**
 * 测试数据始终从完整的合法场景开始，再通过 overrides 精确覆盖单个边界。
 * 这样某个断言失败时，错误来自当前测试关注的字段，而不是缺失的无关字段。
 */
function createDefinition(overrides: Partial<SceneDefinition> = {}): SceneDefinition {
  return {
    id: "prologue",
    mainScript: "scenes/prologue/main.lua",
    cast: [
      { characterId: "alice", role: "heroine", displayName: "Alice" },
      { characterId: "bob" },
    ],
    exits: ["accept", "decline"],
    ...overrides,
  };
}

describe("Scene", () => {
  it("normalizes an explicit main.lua entry and exposes runtime-friendly queries", () => {
    const scene = new Scene(
      createDefinition({
        mainScript: ".\\scenes/./chapter/../prologue/main.lua",
        cast: [{ characterId: " alice ", role: " heroine ", displayName: " Alice " }],
        exits: [" accept ", "decline"],
      }),
    );

    expect(scene.id).toBe("prologue");
    expect(scene.mainScriptPath.value).toBe("scenes/prologue/main.lua");
    expect(scene.cast).toEqual([{ characterId: "alice", role: "heroine", displayName: "Alice" }]);
    expect(scene.exits).toEqual(["accept", "decline"]);
    expect(scene.hasCharacter(" alice ")).toBe(true);
    expect(scene.hasCharacter("bob")).toBe(false);
    expect(scene.getCastMember("alice")).toEqual({ characterId: "alice", role: "heroine", displayName: "Alice" });
    expect(scene.getCastMember("bob")).toBeUndefined();
    expect(scene.getCharacterIds()).toEqual(["alice"]);
    expect(scene.hasExit(" accept ")).toBe(true);
    expect(scene.hasExit("missing")).toBe(false);
    expect(scene.toDefinition()).toEqual({
      id: "prologue",
      mainScript: "scenes/prologue/main.lua",
      cast: [{ characterId: "alice", role: "heroine", displayName: "Alice" }],
      exits: ["accept", "decline"],
    });
  });

  it("uses empty collections when cast and exits are omitted", () => {
    const scene = new Scene({ id: "ending", mainScript: "scenes/ending/main.lua" });

    expect(scene.cast).toEqual([]);
    expect(scene.exits).toEqual([]);
    expect(scene.getCharacterIds()).toEqual([]);
    expect(scene.hasExit("next")).toBe(false);
  });

  it("rejects malformed identities, main.lua entry paths, cast members, and exits", () => {
    for (const id of ["", " Prologue", "prologue ", "Prologue", "1prologue", "prologue name"]) {
      expect(() => new Scene(createDefinition({ id }))).toThrow(/Scene ID/);
    }

    // 主入口必须显式存在于场景目录中；不能把任意 Lua 文件或包根 main.lua 当作场景。
    expect(() => new Scene({ id: "missing-main" } as SceneDefinition)).toThrow(/mainScript/);
    for (const mainScript of [
      "",
      " scenes/prologue/main.lua",
      "scenes/prologue.lua",
      "scenes/prologue/entry.lua",
      "main.lua",
      "../outside/main.lua",
    ]) {
      expect(() => new Scene(createDefinition({ mainScript }))).toThrow();
    }
    expect(() => new Scene(createDefinition({ mainScript: "/outside/main.lua" }))).toThrow(FileSystemError);

    expect(() => new Scene(createDefinition({ cast: "alice" as unknown as readonly [] }))).toThrow(/cast must be an array/);
    expect(() => new Scene(createDefinition({ cast: [{}] as unknown as readonly [] }))).toThrow(/characterId/);
    expect(() => new Scene(createDefinition({ cast: [{ characterId: "alice" }, { characterId: " alice " }] }))).toThrow(
      /duplicate character ID/,
    );
    expect(() => new Scene(createDefinition({ cast: [{ characterId: "alice", role: " " }] }))).toThrow(/role/);
    expect(() => new Scene(createDefinition({ cast: [{ characterId: "alice", displayName: 3 as unknown as string }] }))).toThrow(
      /displayName/,
    );

    expect(() => new Scene(createDefinition({ exits: "next" as unknown as readonly [] }))).toThrow(/exits must be an array/);
    expect(() => new Scene(createDefinition({ exits: [""] }))).toThrow(/exits\[0\]/);
    expect(() => new Scene(createDefinition({ exits: ["next", " next "] }))).toThrow(/duplicate port/);
  });

  it("does not retain mutable input or expose mutable internal data", () => {
    const definition = createDefinition();
    const scene = new Scene(definition);

    // Scene 是包级注册表会长期复用的对象。这里同时验证构造前后两个边界：
    // 修改原始 DTO 不得影响 Scene，修改 getter/toDefinition 返回的副本也不得反向改写 Scene。
    (definition.cast as SceneDefinition["cast"] as { characterId: string; role?: string; displayName?: string }[])[0].characterId = "changed";
    (definition.cast as { characterId: string }[]).push({ characterId: "new" });
    (definition.exits as string[]).push("new-exit");

    const cast = scene.cast as { characterId: string; role?: string; displayName?: string }[];
    cast[0].characterId = "mutated";
    cast.push({ characterId: "mutated-again" });
    const exits = scene.exits as string[];
    exits.push("mutated-exit");
    const exported = scene.toDefinition();
    (exported.cast as { characterId: string }[])[0].characterId = "exported-change";
    (exported.exits as string[]).push("exported-exit");

    expect(scene.cast).toEqual([
      { characterId: "alice", role: "heroine", displayName: "Alice" },
      { characterId: "bob" },
    ]);
    expect(scene.exits).toEqual(["accept", "decline"]);
    expect(scene.getCastMember("alice")).toEqual({ characterId: "alice", role: "heroine", displayName: "Alice" });
  });
});
