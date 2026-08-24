import type {
  LuaChoiceOption,
  LuaDialogueRequest,
  LuaPresentationCommand,
  LuaRequest,
} from "../lua";
import { TuiStage, type TuiCharacterSlotInput } from "./tui-stage";
import type {
  TuiChoiceState,
  TuiDialogueMode,
  TuiDialogueState,
  TuiSide,
  TuiViewSnapshot,
} from "./tui-types";

/**
 * TUI 的纯状态对象。
 *
 * 它不创建终端控件，也不执行 Lua；BlessedRenderer 只读取本对象并重绘。
 */
export class TuiSession {
  public readonly stage = new TuiStage();
  private dialogue: TuiDialogueState | null = null;
  private choices: TuiChoiceState | null = null;
  private readonly history: TuiViewSnapshot[] = [];
  private historyPrepared = false;
  private sceneId = "demo.scene";

  public constructor(sceneId?: string) {
    if (sceneId !== undefined) {
      this.sceneId = sceneId;
    }
  }

  public getSceneId(): string {
    return this.sceneId;
  }

  public setSceneId(sceneId: string): void {
    this.sceneId = sceneId;
  }

  /**
   * 在一组舞台变更开始前记录一次快照。
   *
   * 场景脚本通常会先让角色登场，再显示下一句台词；调用此方法可以让
   * 回退键同时恢复登场前的舞台，而不会把新登场角色残留在旧台词上。
   */
  public beginFrame(): void {
    if (!this.historyPrepared) {
      this.pushHistory();
      this.historyPrepared = true;
    }
  }

  public getDialogue(): TuiDialogueState | null {
    return this.dialogue === null ? null : { ...this.dialogue };
  }

  public getChoices(): TuiChoiceState | null {
    return this.choices === null
      ? null
      : { options: this.choices.options.map((option) => ({ ...option })), selectedIndex: this.choices.selectedIndex };
  }

  /** 根据 Lua 对话请求显示角色台词。 */
  public presentDialogue(request: LuaDialogueRequest, speakerName?: string | null): void {
    this.prepareHistory();
    const visibleSpeaker = request.speaker === null ? null : this.stage.getByCharacterId(request.speaker);
    this.dialogue = {
      mode: "character",
      speakerId: request.speaker,
      speakerName: speakerName ?? request.speakerName ?? visibleSpeaker?.displayName ?? request.speaker,
      text: request.text,
    };
    this.choices = null;
    this.focusSpeaker(request.speaker);
  }

  /** 显示没有角色名的独白。 */
  public presentMonologue(text: string): void {
    this.presentText("monologue", null, null, text);
  }

  /** 显示旁白。 */
  public presentNarration(text: string): void {
    this.presentText("narration", null, null, text);
  }

  /** 显示画外音；说话人不需要在舞台上出现。 */
  public presentOffscreen(speakerId: string, speakerName: string, text: string): void {
    this.presentText("offscreen", speakerId, speakerName, text);
  }

  /** 设置当前选项并将焦点置于第一个可选项。 */
  public presentChoices(options: readonly LuaChoiceOption[]): void {
    if (options.length === 0) {
      throw new Error("TUI choices cannot be empty");
    }
    const firstEnabled = options.findIndex((option) => option.enabled !== false);
    this.choices = {
      options: options.map((option) => ({ ...option })),
      selectedIndex: firstEnabled < 0 ? 0 : firstEnabled,
    };
  }

  /** 让焦点向前或向后移动，跳过禁用选项。 */
  public moveChoice(delta: 1 | -1): void {
    if (this.choices === null) {
      return;
    }
    const options = this.choices.options;
    let index = this.choices.selectedIndex;
    for (let count = 0; count < options.length; count += 1) {
      index = (index + delta + options.length) % options.length;
      if (options[index].enabled !== false) {
        this.choices.selectedIndex = index;
        return;
      }
    }
  }

  /** 返回当前选中的选项 ID。 */
  public getSelectedChoice(): string | null {
    if (this.choices === null) {
      return null;
    }
    const option = this.choices.options[this.choices.selectedIndex];
    return option?.enabled === false ? null : option?.id ?? null;
  }

  /** 处理 Lua 请求；具体按键输入由 BlessedInput 负责。 */
  public presentRequest(request: LuaRequest): void {
    if (request.type === "choice") {
      this.presentChoices(request.options);
      return;
    }
    if (request.type === "wait") {
      // 等待由宿主调度器处理，不覆盖当前台词画面。
      return;
    }
    switch (request.mode) {
      case "monologue":
        this.presentMonologue(request.text);
        return;
      case "narration":
        this.presentNarration(request.text);
        return;
      case "offscreen":
        if (request.speaker === null) {
          throw new Error("offscreen dialogue requires a speaker");
        }
        this.presentOffscreen(request.speaker, request.speakerName ?? request.speaker, request.text);
        return;
      default:
        if (request.speaker === null) {
          this.presentNarration(request.text);
        } else {
          this.presentDialogue(request);
        }
    }
  }

  /**
   * 应用 Lua runtime 发出的舞台命令。
   *
   * 命令通常发生在下一条台词请求之前；先记录一次快照，回退键就能恢复
   * 角色登场、下场和换位前的画面。
   */
  public applyPresentation(command: LuaPresentationCommand): void {
    this.beginFrame();
    switch (command.kind) {
      case "stage.show":
        this.stage.show(
          {
            characterId: command.characterId,
            displayName: command.displayName ?? command.characterId,
            ...(command.role === undefined ? {} : { role: command.role }),
            ...(command.expression === undefined ? {} : { expression: command.expression }),
          },
          command.side,
        );
        return;
      case "stage.hide":
        this.stage.hide(command.characterId);
        return;
      case "stage.move":
        this.stage.move(command.characterId, command.side);
        return;
      case "stage.focus":
        this.stage.focus(command.characterId);
        return;
    }
  }

  /**
   * 回到上一个台词视图。
   *
   * 当前阶段只回退 TUI 内存中的显示状态，不改变 Lua coroutine 或剧情变量。
   */
  public goBack(): boolean {
    const snapshot = this.history.pop();
    if (snapshot === undefined) {
      return false;
    }
    this.historyPrepared = false;
    this.stage.restore(snapshot.stage);
    this.dialogue = snapshot.dialogue === null ? null : { ...snapshot.dialogue };
    this.choices = snapshot.choices === null
      ? null
      : { options: snapshot.choices.options.map((option) => ({ ...option })), selectedIndex: snapshot.choices.selectedIndex };
    return true;
  }

  public canGoBack(): boolean {
    return this.history.length > 0;
  }

  public snapshot(): TuiViewSnapshot {
    return {
      stage: this.stage.snapshot(),
      dialogue: this.dialogue === null ? null : { ...this.dialogue },
      choices: this.getChoices(),
    };
  }

  private presentText(mode: TuiDialogueMode, speakerId: string | null, speakerName: string | null, text: string): void {
    this.prepareHistory();
    this.dialogue = { mode, speakerId, speakerName, text };
    this.choices = null;
    if (mode !== "character") {
      this.stage.focus(null);
    }
  }

  private pushHistory(): void {
    this.history.push(this.snapshot());
  }

  private prepareHistory(): void {
    if (!this.historyPrepared) {
      this.pushHistory();
    }
    this.historyPrepared = false;
  }

  private focusSpeaker(speakerId: string | null): void {
    if (speakerId === null) {
      this.stage.focus(null);
      return;
    }
    try {
      this.stage.focus(speakerId);
    } catch {
      // 角色可能是画外发言者；此时不改变舞台登场状态。
      this.stage.focus(null);
    }
  }
}

export type { TuiCharacterSlotInput, TuiSide } from "./tui-stage";
