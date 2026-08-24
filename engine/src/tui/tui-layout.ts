import type { TuiLayoutResult, TuiRect } from "./tui-types";

/** 终端布局计算器；不依赖 Blessed，便于用固定尺寸测试。 */
export class TuiLayout {
  public static calculate(width: number, height: number, choiceCount = 0): TuiLayoutResult {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 40 || height < 14) {
      throw new RangeError("TUI requires a terminal of at least 40x14");
    }

    const headerHeight = 1;
    const footerHeight = 1;
    const dialogueHeight = 5;
    const choicesHeight = Math.min(7, Math.max(3, choiceCount + 2));
    const stageHeight = height - headerHeight - footerHeight - dialogueHeight - choicesHeight;
    const halfWidth = Math.floor(width / 2);

    const header = rect(0, 0, width, headerHeight);
    const stage = rect(0, headerHeight, width, stageHeight);
    const dialogueTop = stage.top + stage.height;
    const dialogue = rect(0, dialogueTop, width, dialogueHeight);
    const choicesTop = dialogue.top + dialogue.height;
    const choices = rect(0, choicesTop, width, choicesHeight);
    const footer = rect(0, choices.top + choices.height, width, footerHeight);

    return {
      header,
      stage,
      leftCharacter: rect(0, stage.top, halfWidth, stage.height),
      rightCharacter: rect(halfWidth, stage.top, width - halfWidth, stage.height),
      dialogue,
      choices,
      footer,
    };
  }
}

function rect(left: number, top: number, width: number, height: number): TuiRect {
  return { left, top, width, height };
}
