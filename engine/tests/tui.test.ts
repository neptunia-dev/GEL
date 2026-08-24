import { describe, expect, it } from "vitest";
import { TuiLayout, TuiSession, TuiStage } from "../src/tui";

describe("TuiLayout", () => {
  it("为双角色舞台保留左右两个等高区域", () => {
    const layout = TuiLayout.calculate(100, 30, 2);

    expect(layout.leftCharacter.top).toBe(layout.stage.top);
    expect(layout.rightCharacter.top).toBe(layout.stage.top);
    expect(layout.leftCharacter.height).toBe(layout.stage.height);
    expect(layout.rightCharacter.height).toBe(layout.stage.height);
    expect(layout.leftCharacter.width + layout.rightCharacter.width).toBe(100);
    expect(layout.footer.top + layout.footer.height).toBe(30);
  });

  it("拒绝过小的终端尺寸", () => {
    expect(() => TuiLayout.calculate(39, 24)).toThrow(/40x14/);
    expect(() => TuiLayout.calculate(80, 13)).toThrow(/40x14/);
  });
});

describe("TuiStage", () => {
  it("只显示显式登场的角色", () => {
    const stage = new TuiStage();
    stage.show({ characterId: "alice", displayName: "Alice" }, "left");

    expect(stage.get("left")?.characterId).toBe("alice");
    expect(stage.get("right")).toBeNull();
  });

  it("支持登场、换位、聚焦和下场", () => {
    const stage = new TuiStage();
    stage.show({ characterId: "alice", displayName: "Alice" }, "left");
    stage.move("alice", "right");
    stage.focus("alice");

    expect(stage.get("left")).toBeNull();
    expect(stage.get("right")?.focused).toBe(true);
    expect(stage.hide("alice")).toBe(true);
    expect(stage.get("right")).toBeNull();
  });
});

describe("TuiSession", () => {
  it("支持角色台词、独白、旁白和视图回退", () => {
    const session = new TuiSession("prologue");
    session.stage.show({ characterId: "alice", displayName: "Alice" }, "left");
    session.presentDialogue({ type: "dialogue", mode: "character", speaker: "alice", text: "你好。" });
    session.presentMonologue("我该回答什么？");

    expect(session.getDialogue()).toMatchObject({ mode: "monologue", speakerId: null });
    expect(session.goBack()).toBe(true);
    expect(session.getDialogue()).toMatchObject({ mode: "character", speakerId: "alice", text: "你好。" });
    expect(session.goBack()).toBe(true);
    expect(session.getDialogue()).toBeNull();
    expect(session.goBack()).toBe(false);
  });

  it("支持上下移动选项并跳过禁用项", () => {
    const session = new TuiSession();
    session.presentChoices([
      { id: "a", text: "A" },
      { id: "b", text: "B", enabled: false },
      { id: "c", text: "C" },
    ]);

    expect(session.getSelectedChoice()).toBe("a");
    session.moveChoice(1);
    expect(session.getSelectedChoice()).toBe("c");
    session.moveChoice(-1);
    expect(session.getSelectedChoice()).toBe("a");
  });

  it("应用 Lua 舞台命令并保留画外音说话人名称", () => {
    const session = new TuiSession("prologue");
    session.applyPresentation({
      kind: "stage.show",
      characterId: "patchouli",
      side: "right",
      displayName: "帕秋莉",
    });
    session.presentRequest({
      type: "dialogue",
      mode: "offscreen",
      speaker: "protagonist",
      speakerName: "我",
      text: "我在这里。",
    });

    expect(session.stage.get("left")).toBeNull();
    expect(session.stage.get("right")?.displayName).toBe("帕秋莉");
    expect(session.getDialogue()).toMatchObject({
      mode: "offscreen",
      speakerId: "protagonist",
      speakerName: "我",
    });
  });
});
