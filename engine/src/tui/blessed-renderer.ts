import blessed from "blessed";
import type { Readable, Writable } from "node:stream";
import type { TuiSession } from "./tui-session";
import { TuiLayout } from "./tui-layout";
import type { TuiCharacterSlot, TuiRect } from "./tui-types";

type BlessedBox = any;

/**
 * Blessed 的薄适配层。
 *
 * 所有剧情状态仍然保存在 TuiSession，Blessed 控件只负责显示和按键事件。
 */
export class BlessedRenderer {
  public readonly screen: any;
  private readonly header: BlessedBox;
  private readonly leftCharacter: BlessedBox;
  private readonly rightCharacter: BlessedBox;
  private readonly dialogue: BlessedBox;
  private readonly choices: BlessedBox;
  private readonly footer: BlessedBox;

  public constructor(options: { input?: Readable; output?: Writable; title?: string } = {}) {
    this.screen = blessed.screen({
      smartCSR: true,
      fullUnicode: true,
      input: options.input,
      output: options.output,
      title: options.title ?? "GEL TUI",
      terminal: process.env.TERM ?? "xterm-256color",
    } as any);
    this.header = this.createBox(false);
    this.leftCharacter = this.createBox();
    this.rightCharacter = this.createBox();
    this.dialogue = this.createBox();
    this.choices = this.createBox();
    this.footer = this.createBox(false);
  }

  public render(session: TuiSession): void {
    const width = Number(this.screen.width ?? 80);
    const height = Number(this.screen.height ?? 24);
    const choices = session.getChoices();
    const layout = TuiLayout.calculate(width, height, choices?.options.length ?? 0);

    this.applyRect(this.header, layout.header);
    this.applyRect(this.leftCharacter, layout.leftCharacter);
    this.applyRect(this.rightCharacter, layout.rightCharacter);
    this.applyRect(this.dialogue, layout.dialogue);
    this.applyRect(this.choices, layout.choices);
    this.applyRect(this.footer, layout.footer);

    this.header.setContent(` GEL GAME  |  ${escapeText(session.getSceneId())}  |  {bold}PLAY{/bold}`);
    this.leftCharacter.setContent(formatSlot(session.stage.get("left"), "LEFT"));
    this.rightCharacter.setContent(formatSlot(session.stage.get("right"), "RIGHT"));
    this.dialogue.setContent(formatDialogue(session.getDialogue()));
    this.choices.setContent(formatChoices(choices));
    this.footer.setContent(" Enter/Space 推进   ↑↓ 选择   B/Backspace 回退   Q 退出");
    this.screen.render();
  }

  public bind(keys: string | string[], listener: (ch: string, key: any) => void): void {
    this.screen.key(keys, listener);
  }

  public destroy(): void {
    if (!this.screen.destroyed) {
      this.screen.destroy();
    }
  }

  private createBox(border = true): BlessedBox {
    return blessed.box({
      parent: this.screen,
      border: border ? "line" : undefined,
      tags: true,
      padding: border ? { left: 1, right: 1 } : { left: 1, right: 1 },
      style: { fg: "white", border: { fg: "gray" } },
    });
  }

  private applyRect(box: BlessedBox, area: TuiRect): void {
    box.left = area.left;
    box.top = area.top;
    box.width = area.width;
    box.height = area.height;
  }
}

function formatSlot(slot: TuiCharacterSlot | null, side: string): string {
  if (slot === null) {
    return `{gray-fg} ${side}  空{/gray-fg}`;
  }
  const focus = slot.focused ? "{yellow-fg}{bold}◆{/bold}{/yellow-fg}" : "◇";
  const role = slot.role === undefined ? "" : `\n{gray-fg}${escapeText(slot.role)}{/gray-fg}`;
  const expression = slot.expression === undefined ? "" : `\n${escapeText(slot.expression)}`;
  return `${focus} {bold}${escapeText(slot.displayName)}{/bold}${role}${expression}`;
}

function formatDialogue(dialogue: ReturnType<TuiSession["getDialogue"]>): string {
  if (dialogue === null) {
    return "{gray-fg}等待剧情...{/gray-fg}";
  }
  const mode = dialogue.mode.toUpperCase();
  const speaker = dialogue.speakerName === null ? mode : escapeText(dialogue.speakerName);
  return `{cyan-fg}${speaker}{/cyan-fg}\n${escapeText(dialogue.text)}`;
}

function formatChoices(choices: ReturnType<TuiSession["getChoices"]>): string {
  if (choices === null) {
    return "{gray-fg}没有待选项{/gray-fg}";
  }
  return choices.options
    .map((option, index) => {
      const selected = index === choices.selectedIndex;
      const marker = selected ? "{yellow-fg}> {/yellow-fg}" : "  ";
      const disabled = option.enabled === false ? "{gray-fg}" : "";
      const end = option.enabled === false ? "{/gray-fg}" : "";
      return `${marker}${index + 1}. ${disabled}${escapeText(option.text)}${end}`;
    })
    .join("\n");
}

function escapeText(value: string): string {
  return value.replaceAll("{", "\\{").replaceAll("}", "\\}");
}
