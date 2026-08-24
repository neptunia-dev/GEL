import { lua, lualib, to_luastring } from "fengari";

type LuaState = any;

export interface LuaSandboxOptions {
  /** 场景脚本保留的标准库。 */
  libraries?: readonly ("table" | "string" | "math" | "utf8" | "coroutine")[];
  /** 每次协程恢复允许执行的最大 VM 指令数。 */
  instructionLimit?: number;
}

const DEFAULT_LIBRARIES = ["table", "string", "math", "utf8"] as const;

const REMOVED_GLOBALS = [
  "io",
  "os",
  "debug",
  "package",
  "require",
  "dofile",
  "loadfile",
  "load",
  "collectgarbage",
] as const;

export function configureSandbox(state: LuaState, options: LuaSandboxOptions = {}): void {
  lualib.luaL_openlibs(state);
  const libraries = options.libraries ?? DEFAULT_LIBRARIES;
  const allowed = new Set(libraries);
  for (const library of ["table", "string", "math", "utf8", "coroutine"] as const) {
    if (!allowed.has(library)) {
      removeGlobal(state, library);
    }
  }
  for (const global of REMOVED_GLOBALS) {
    removeGlobal(state, global);
  }
  if (options.instructionLimit !== undefined) {
    installInstructionLimit(state, options.instructionLimit);
  }
}

export function installInstructionLimit(state: LuaState, instructionLimit: number): void {
  if (!Number.isInteger(instructionLimit) || instructionLimit < 1) {
    throw new RangeError("instructionLimit must be a positive integer");
  }
  lua.lua_sethook(
    state,
    (hookState: LuaState) => {
      lua.lua_pushliteral(hookState, `instruction limit exceeded (${instructionLimit})`);
      lua.lua_error(hookState);
    },
    lua.LUA_MASKCOUNT,
    instructionLimit,
  );
}

function removeGlobal(state: LuaState, name: string): void {
  lua.lua_pushnil(state);
  lua.lua_setglobal(state, to_luastring(name));
}
