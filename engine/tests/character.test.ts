import { describe, expect, it } from "vitest";
import { Character } from "../src/character";

describe("Character", () => {
  it("normalizes identity and creates a mutable portrait state from its definition", () => {
    const character = new Character({
      id: "alice",
      name: " 爱丽丝 ",
      aliases: [" Alice ", "爱丽丝同学", "Alice"],
      tags: [" heroine ", " heroine "],
      portraits: [
        { id: " normal ", asset: " characters/alice/normal.png " },
        { id: "smile", asset: "characters/alice/smile.png" },
      ],
      defaultPortraitId: " normal ",
    });

    expect(character.id).toBe("alice");
    expect(character.name).toBe("爱丽丝");
    expect(character.displayName).toBe("爱丽丝");
    expect(character.aliases).toEqual(["Alice", "爱丽丝同学"]);
    expect(character.tags).toEqual(["heroine"]);
    expect(character.defaultPortraitId).toBe("normal");
    expect(character.portraitId).toBe("normal");
    expect(character.portrait).toEqual({ id: "normal", asset: "characters/alice/normal.png" });
    expect(character.portraits).toEqual([
      { id: "normal", asset: "characters/alice/normal.png" },
      { id: "smile", asset: "characters/alice/smile.png" },
    ]);
    expect(character.getPortrait(" smile ")).toEqual({ id: "smile", asset: "characters/alice/smile.png" });
    expect(character.hasPortrait("smile")).toBe(true);
    expect(character.matches(" alice ")).toBe(true);
    expect(character.matches("爱丽丝同学")).toBe(true);
    expect(character.matches("ALICE")).toBe(false);
    expect(character.hasTag(" heroine ")).toBe(true);
  });

  it("changes and restores display and portrait state without changing its definition", () => {
    const character = new Character({
      id: "alice",
      name: "爱丽丝",
      portraits: [
        { id: "normal", asset: "characters/alice/normal.png" },
        { id: "smile", asset: "characters/alice/smile.png" },
      ],
      defaultPortraitId: "normal",
    });

    character.setDisplayName(" 小爱 ");
    character.setPortrait("smile");
    const snapshot = character.snapshot();

    expect(snapshot).toEqual({ displayName: "小爱", portraitId: "smile" });
    expect(character.matches("小爱")).toBe(true);

    character.setDisplayName("爱丽丝同学");
    character.setPortrait(null);
    expect(character.portrait).toBeNull();

    character.restore(snapshot);
    expect(character.displayName).toBe("小爱");
    expect(character.portraitId).toBe("smile");
    expect(character.toDefinition()).toEqual({
      id: "alice",
      name: "爱丽丝",
      aliases: [],
      tags: [],
      portraits: [
        { id: "normal", asset: "characters/alice/normal.png" },
        { id: "smile", asset: "characters/alice/smile.png" },
      ],
      defaultPortraitId: "normal",
    });

    character.resetState();
    expect(character.snapshot()).toEqual({ displayName: "爱丽丝", portraitId: "normal" });
  });

  it("does not retain mutable definition input or expose mutable definitions", () => {
    const aliases = ["小爱"];
    const tags = ["heroine"];
    const portraits = [{ id: "normal", asset: "characters/alice/normal.png" }];
    const character = new Character({ id: "alice", name: "爱丽丝", aliases, tags, portraits });

    aliases.push("外部修改");
    tags.push("外部标签");
    portraits[0].asset = "changed.png";
    portraits.push({ id: "smile", asset: "characters/alice/smile.png" });
    const exposedPortraits = character.portraits as { id: string; asset: string }[];
    exposedPortraits[0].asset = "mutated.png";
    const selectedPortrait = character.getPortrait("normal") as { id: string; asset: string };
    selectedPortrait.asset = "also-mutated.png";
    const exported = character.toDefinition();
    (exported.aliases as string[]).push("导出别名修改");
    (exported.tags as string[]).push("导出标签修改");
    (exported.portraits as { id: string; asset: string }[])[0].asset = "exported-mutation.png";

    expect(character.aliases).toEqual(["小爱"]);
    expect(character.tags).toEqual(["heroine"]);
    expect(character.getPortrait("normal")).toEqual({ id: "normal", asset: "characters/alice/normal.png" });
    expect(character.portraits).toEqual([{ id: "normal", asset: "characters/alice/normal.png" }]);
  });

  it("rejects malformed identity and portrait definitions, and preserves state when a restore fails", () => {
    expect(() => new Character({ id: "", name: "爱丽丝" })).toThrow(/id must match/);
    expect(() => new Character({ id: "alice", name: "  " })).toThrow(/name cannot be empty/);
    expect(() => new Character({ id: "alice", name: "爱丽丝", aliases: ["  "] })).toThrow(/aliases cannot be empty/);
    expect(() => new Character({ id: "alice", name: "爱丽丝", tags: ["  "] })).toThrow(/tags cannot be empty/);
    expect(() => new Character({ id: "alice", name: "爱丽丝", portraits: "normal" as unknown as readonly [] })).toThrow(
      /portraits must be an array/,
    );
    expect(() => new Character({
      id: "alice",
      name: "爱丽丝",
      portraits: [{} as unknown as { id: string; asset: string }],
    })).toThrow(/portraits\[0\].id/);
    expect(() => new Character({
      id: "alice",
      name: "爱丽丝",
      portraits: [
        { id: "normal", asset: "normal.png" },
        { id: " normal ", asset: "another.png" },
      ],
    })).toThrow(/duplicate ID/);
    expect(() => new Character({
      id: "alice",
      name: "爱丽丝",
      portraits: [{ id: "normal", asset: "normal.png" }],
      defaultPortraitId: "missing",
    })).toThrow(/defaultPortraitId.*not declared/);

    const character = new Character({
      id: "alice",
      name: "爱丽丝",
      portraits: [{ id: "normal", asset: "normal.png" }],
      defaultPortraitId: "normal",
    });
    expect(() => character.setPortrait("missing")).toThrow(/not declared/);
    expect(() => character.restore({ displayName: "小爱", portraitId: "missing" })).toThrow(/not declared/);
    expect(character.snapshot()).toEqual({ displayName: "爱丽丝", portraitId: "normal" });
  });
});
