import { describe, expect, it } from "vitest";
import { Character } from "../src/character";

describe("Character", () => {
  it("规范化角色资料并匹配 ID、名称和别名", () => {
    const character = new Character({
      id: " alice ",
      name: " 爱丽丝 ",
      aliases: [" Alice ", "爱丽丝同学", "Alice"],
      tags: [" heroine ", " heroine "],
    });

    expect(character.id).toBe("alice");
    expect(character.name).toBe("爱丽丝");
    expect(character.aliases).toEqual(["Alice", "爱丽丝同学"]);
    expect(character.tags).toEqual(["heroine"]);
    expect(character.matches(" alice ")).toBe(true);
    expect(character.matches("爱丽丝同学")).toBe(true);
    expect(character.matches("Alice")).toBe(true);
    expect(character.matches("ALICE")).toBe(false);
    expect(character.hasTag(" heroine ")).toBe(true);
  });

  it("不会暴露构造参数和导出结果中的可变数组", () => {
    const aliases = ["小爱"];
    const tags = ["heroine"];
    const character = new Character({ id: "alice", name: "爱丽丝", aliases, tags });

    aliases.push("外部修改");
    tags.push("外部标签");
    const definition = character.toDefinition();
    (definition.aliases as string[]).push("导出结果修改");
    (definition.tags as string[]).push("导出标签修改");

    expect(character.aliases).toEqual(["小爱"]);
    expect(character.tags).toEqual(["heroine"]);
  });

  it("拒绝空的角色 ID、名称、别名和标签", () => {
    expect(() => new Character({ id: "", name: "爱丽丝" })).toThrow(/id cannot be empty/);
    expect(() => new Character({ id: "alice", name: "  " })).toThrow(/name cannot be empty/);
    expect(() => new Character({ id: "alice", name: "爱丽丝", aliases: ["  "] })).toThrow(
      /aliases cannot be empty/,
    );
    expect(() => new Character({ id: "alice", name: "爱丽丝", tags: ["  "] })).toThrow(/tags cannot be empty/);
  });
});
