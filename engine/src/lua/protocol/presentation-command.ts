/** 角色在舞台上的左右位置。 */
export type LuaStageSide = "left" | "right";

export interface LuaStageShowCommand {
  kind: "stage.show";
  characterId: string;
  side: LuaStageSide;
  role?: string;
  displayName?: string;
  expression?: string;
}

export interface LuaStageHideCommand {
  kind: "stage.hide";
  characterId: string;
}

export interface LuaStageMoveCommand {
  kind: "stage.move";
  characterId: string;
  side: LuaStageSide;
}

export interface LuaStageFocusCommand {
  kind: "stage.focus";
  characterId: string | null;
}

export type LuaPresentationCommand =
  | LuaStageShowCommand
  | LuaStageHideCommand
  | LuaStageMoveCommand
  | LuaStageFocusCommand;

export interface LuaPresentationEvent {
  type: "presentation";
  command: LuaPresentationCommand;
}
