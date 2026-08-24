import { BlessedRenderer } from "./blessed-renderer";
import { TuiSession } from "./tui-session";

/**
 * 不依赖 Lua 的布局演示。
 *
 * 用 Enter 在几帧固定演示画面之间推进，用 B 回到上一帧，用 Q 退出。
 */
export class TuiDemoApp {
  private frame = 0;
  private readonly session = new TuiSession("prologue.school-gate");
  private readonly renderer = new BlessedRenderer({ title: "GEL TUI Demo" });

  public start(): void {
    this.setupFrame();
    this.renderer.bind(["enter", "space"], () => this.next());
    this.renderer.bind(["up"], () => {
      this.session.moveChoice(-1);
      this.renderer.render(this.session);
    });
    this.renderer.bind(["down"], () => {
      this.session.moveChoice(1);
      this.renderer.render(this.session);
    });
    this.renderer.bind(["b", "backspace"], () => {
      if (this.frame > 0 && this.session.goBack()) {
        this.frame -= 1;
        this.renderer.render(this.session);
      }
    });
    this.renderer.bind(["q", "C-c"], () => {
      this.renderer.destroy();
    });
    this.renderer.screen.on("resize", () => this.renderer.render(this.session));
    this.renderer.render(this.session);
  }

  private next(): void {
    if (this.frame >= 4) {
      this.frame = 0;
    } else {
      this.frame += 1;
    }
    this.setupFrame();
    this.renderer.render(this.session);
  }

  private setupFrame(): void {
    this.session.beginFrame();
    switch (this.frame) {
      case 0:
        this.session.stage.restore({ left: null, right: null });
        this.session.stage.show({ characterId: "alice", displayName: "Alice", role: "同班同学", expression: "^_^" }, "left");
        this.session.stage.focus("alice");
        this.session.presentDialogue({ type: "dialogue", mode: "character", speaker: "alice", text: "今天一起回家吗？" });
        this.session.presentChoices([
          { id: "accept", text: "一起回家" },
          { id: "decline", text: "还有事情" },
        ]);
        break;
      case 1:
        this.session.stage.show({ characterId: "bob", displayName: "Bob", role: "朋友", expression: "-_-" }, "right");
        this.session.stage.focus("bob");
        this.session.presentDialogue({ type: "dialogue", mode: "character", speaker: "bob", text: "你们在聊什么？" });
        break;
      case 2:
        this.session.stage.focus(null);
        this.session.presentMonologue("我该怎么回答才好？");
        break;
      case 3:
        this.session.stage.hide("alice");
        this.session.stage.focus("bob");
        this.session.presentDialogue({ type: "dialogue", mode: "character", speaker: "bob", text: "Alice 已经先走了。" });
        break;
      default:
        this.session.stage.restore({ left: null, right: null });
        this.session.presentNarration("走廊重新安静下来。");
        break;
    }
  }
}

if (require.main === module) {
  new TuiDemoApp().start();
}
