import { lua, lauxlib, to_luastring } from "fengari";

type LuaState = any;

export class LuaRuntimeError extends Error {
  readonly sourceName: string;
  readonly status: number;
  readonly luaMessage: string;
  readonly line?: number;

  constructor(sourceName: string, status: number, luaMessage: string) {
    super(`${sourceName}: ${luaMessage}`);
    this.name = "LuaRuntimeError";
    this.sourceName = sourceName;
    this.status = status;
    this.luaMessage = luaMessage;
    const line = /:(\d+):/.exec(luaMessage)?.[1];
    this.line = line === undefined ? undefined : Number(line);
  }
}

export function readLuaError(state: LuaState, sourceName: string, status: number): LuaRuntimeError {
  const value = lua.lua_tojsstring(state, -1);
  const message = typeof value === "string" ? value : describeNativeError(value);
  let finalMessage = message;
  try {
    lauxlib.luaL_traceback(state, state, to_luastring(message), 1);
    const trace = lua.lua_tojsstring(state, -1);
    if (typeof trace === "string" && trace.length > 0) {
      finalMessage = trace;
    }
    lua.lua_pop(state, 1);
  } catch {
    // traceback 只是补充信息；不可用时保留原始错误。
  }
  return new LuaRuntimeError(sourceName, status, finalMessage);
}

export function raiseLuaBindingError(state: LuaState, message: string): number {
  lua.lua_pushstring(state, to_luastring(message));
  return lua.lua_error(state);
}

function describeNativeError(value: unknown): string {
  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return String(value ?? "Unknown Lua error");
}
