import { lua, lauxlib, to_luastring } from "fengari";
import { readLuaError } from "../errors/lua-error";
import { configureSandbox, installInstructionLimit, type LuaSandboxOptions } from "../sandbox/lua-sandbox";

type LuaState = any;

export interface LoadedLuaScript {
  readonly mainState: LuaState;
  readonly coroutineState: LuaState;
}

/** 编译场景 chunk，并把其返回的 function 移入新的 coroutine。 */
export function loadLuaScript(source: string, sourceName: string, sandbox?: LuaSandboxOptions): LoadedLuaScript {
  const mainState = lauxlib.luaL_newstate();
  try {
    configureSandbox(mainState, sandbox);
    const bytes = to_luastring(source);
    const loadStatus = lauxlib.luaL_loadbuffer(mainState, bytes, bytes.length, to_luastring(sourceName));
    if (loadStatus !== lua.LUA_OK) {
      throw readLuaError(mainState, sourceName, loadStatus);
    }

    const executeStatus = lua.lua_resume(mainState, null, 0);
    if (executeStatus !== lua.LUA_OK) {
      throw readLuaError(mainState, sourceName, executeStatus);
    }
    if (lua.lua_gettop(mainState) < 1 || !lua.lua_isfunction(mainState, -1)) {
      throw new Error(`${sourceName}: script must return function(ctx) ... end`);
    }

    const functionIndex = lua.lua_gettop(mainState);
    const coroutineState = lua.lua_newthread(mainState);
    lua.lua_pushvalue(mainState, functionIndex);
    lua.lua_xmove(mainState, coroutineState, 1);
    if (sandbox?.instructionLimit !== undefined) {
      installInstructionLimit(coroutineState, sandbox.instructionLimit);
    }
    return { mainState, coroutineState };
  } catch (error) {
    lua.lua_close(mainState);
    throw error;
  }
}
