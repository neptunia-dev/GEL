import { lua } from "fengari";
import { LuaApi } from "../api-base";
import type { LuaApiHost, LuaState } from "../api-types";
import { pushLuaValue } from "../../values/lua-value-codec";
import type { LuaWaitRequest } from "../../protocol/lua-request";
import type { LuaValue } from "../../values/lua-types";

/** 时间调度领域的 Lua API。 */
export class TimeApi extends LuaApi {
  public readonly namespace = "time";
  public readonly capability = "time";

  public constructor(host: LuaApiHost) {
    super(host);
    this.expose("wait", "request", this.wait);
  }

  private wait(state: LuaState): number {
    if (lua.lua_type(state, 2) !== lua.LUA_TNUMBER) {
      throw new TypeError("seconds must be a non-negative finite number");
    }
    const seconds = Number(lua.lua_tonumber(state, 2));
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new TypeError("seconds must be a non-negative finite number");
    }
    const request: LuaWaitRequest = { type: "wait", seconds };
    pushLuaValue(state, request as unknown as LuaValue);
    return lua.lua_yield(state, 1);
  }
}
