/** 台词的语义模式。 */
export type LuaDialogueMode = "character" | "monologue" | "narration" | "offscreen";

export interface LuaChoiceOption {
  id: string;
  text: string;
  enabled?: boolean;
}

export interface LuaDialogueRequest {
  type: "dialogue";
  mode: LuaDialogueMode;
  speaker: string | null;
  speakerName?: string;
  text: string;
}

export interface LuaChoiceRequest {
  type: "choice";
  options: LuaChoiceOption[];
}

export interface LuaWaitRequest {
  type: "wait";
  seconds: number;
}

export type LuaRequest = LuaDialogueRequest | LuaChoiceRequest | LuaWaitRequest;

/** 场景结束时由 Lua 返回的出口结果。 */
export interface LuaExitResult {
  type: "exit";
  port: string;
}

/** Lua 主动结束整个剧情。 */
export interface LuaEndResult {
  type: "end";
}

export type LuaResult = LuaExitResult | LuaEndResult;
