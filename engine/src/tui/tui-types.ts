import type { LuaChoiceOption, LuaDialogueRequest, LuaRequest } from "../lua";

/** 角色在 TUI 舞台上的左右位置。 */
export type TuiSide = "left" | "right";

/** 台词框的显示模式。 */
export type TuiDialogueMode = "character" | "monologue" | "narration" | "offscreen";

/** 终端舞台上的角色显示数据。 */
export interface TuiCharacterSlot {
  characterId: string;
  displayName: string;
  role?: string;
  expression?: string;
  side: TuiSide;
  focused: boolean;
}

/** 当前台词的显示状态。 */
export interface TuiDialogueState {
  mode: TuiDialogueMode;
  speakerId: string | null;
  speakerName: string | null;
  text: string;
}

/** 当前选项列表及焦点位置。 */
export interface TuiChoiceState {
  options: readonly LuaChoiceOption[];
  selectedIndex: number;
}

/** TUI 舞台的可序列化快照。 */
export interface TuiStageSnapshot {
  left: TuiCharacterSlot | null;
  right: TuiCharacterSlot | null;
}

/** 用于单步回退的完整视图快照。 */
export interface TuiViewSnapshot {
  stage: TuiStageSnapshot;
  dialogue: TuiDialogueState | null;
  choices: TuiChoiceState | null;
}

/** TUI 对 Lua 请求的窄适配类型。 */
export type TuiDialogueRequest = LuaDialogueRequest;
export type TuiRequest = LuaRequest;

/** 终端布局中的矩形区域。 */
export interface TuiRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 一帧终端界面的区域计算结果。 */
export interface TuiLayoutResult {
  header: TuiRect;
  stage: TuiRect;
  leftCharacter: TuiRect;
  rightCharacter: TuiRect;
  dialogue: TuiRect;
  choices: TuiRect;
  footer: TuiRect;
}
