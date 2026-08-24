import { LuaRuntimeError } from "../errors/lua-error";
import type { LuaValue } from "../values/lua-types";
import type { LuaChoiceOption, LuaDialogueMode, LuaRequest, LuaResult } from "./lua-request";

export function requireIdentifier(value: string, name: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`${name} must not be empty`);
  }
  return normalized;
}

export function isLuaObject(value: unknown): value is { [key: string]: LuaValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isDialogueMode(value: unknown): value is LuaDialogueMode {
  return value === "character" || value === "monologue" || value === "narration" || value === "offscreen";
}

/** 将 Lua yield 的普通值解析为严格的宿主请求。 */
export function parseLuaRequest(value: LuaValue, sourceName: string, status: number): LuaRequest {
  if (!isLuaObject(value)) {
    throw invalid(sourceName, status, "Lua yielded an invalid request");
  }
  if (value.type === "dialogue") {
    const speaker = value.speaker === undefined ? null : value.speaker;
    const mode = value.mode;
    if (
      typeof value.text !== "string" ||
      !(speaker === null || typeof speaker === "string") ||
      !isDialogueMode(mode) ||
      (value.speakerName !== undefined && typeof value.speakerName !== "string") ||
      ((mode === "character" || mode === "offscreen") && speaker === null) ||
      ((mode === "monologue" || mode === "narration") && speaker !== null)
    ) {
      throw invalid(sourceName, status, "Invalid dialogue request");
    }
    return value.speakerName === undefined
      ? { type: "dialogue", mode, speaker, text: value.text }
      : { type: "dialogue", mode, speaker, speakerName: value.speakerName as string, text: value.text };
  }

  if (value.type === "wait") {
    if (typeof value.seconds !== "number" || !Number.isFinite(value.seconds) || value.seconds < 0) {
      throw invalid(sourceName, status, "Invalid wait request");
    }
    return { type: "wait", seconds: value.seconds };
  }

  if (value.type === "choice") {
    if (!Array.isArray(value.options) || value.options.length === 0) {
      throw invalid(sourceName, status, "Invalid choice request");
    }
    return { type: "choice", options: parseChoiceOptions(value.options, sourceName, status) };
  }

  throw invalid(sourceName, status, "Lua yielded an invalid request");
}

/** 将 Lua 场景函数的返回值解析为出口结果。 */
export function parseLuaResult(value: LuaValue, sourceName: string, status: number): LuaResult {
  if (!isLuaObject(value)) {
    throw invalid(sourceName, status, "Scene function returned an invalid result");
  }
  if (value.type === "exit" && typeof value.port === "string" && value.port.trim().length > 0) {
    return { type: "exit", port: value.port };
  }
  if (value.type === "end") {
    return { type: "end" };
  }
  throw invalid(sourceName, status, "Scene function returned an invalid result");
}

function parseChoiceOptions(values: LuaValue[], sourceName: string, status: number): LuaChoiceOption[] {
  const seen = new Set<string>();
  return values.map((value) => {
    if (!isLuaObject(value) || typeof value.id !== "string" || typeof value.text !== "string") {
      throw invalid(sourceName, status, "Invalid choice option");
    }
    if (value.id.trim().length === 0 || seen.has(value.id)) {
      throw invalid(sourceName, status, "Invalid choice option ID");
    }
    if (value.enabled !== undefined && typeof value.enabled !== "boolean") {
      throw invalid(sourceName, status, "Invalid choice option enabled flag");
    }
    seen.add(value.id);
    return { id: value.id, text: value.text, enabled: value.enabled !== false };
  });
}

function invalid(sourceName: string, status: number, message: string): LuaRuntimeError {
  return new LuaRuntimeError(sourceName, status, message);
}
