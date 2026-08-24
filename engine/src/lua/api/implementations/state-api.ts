import { lua } from "fengari";
import { LuaApi } from "../api-base";
import type { LuaApiHost, LuaState } from "../api-types";
import { pushLuaValue, readLuaValue } from "../../values/lua-value-codec";
import { readStateKey } from "../binding-utils";

/** 剧情状态领域的 Lua API。 */
export class StateApi extends LuaApi {
  public readonly namespace = "state";
  public readonly capability = "state";

  public constructor(host: LuaApiHost) {
    super(host);
    this.expose("get", "sync", this.get);
    this.expose("set", "sync", this.set);
    this.expose("add", "sync", this.add);
    this.expose("has", "sync", this.has);
    this.expose("remove", "sync", this.remove);
  }

  private get(state: LuaState): number {
    const key = readStateKey(state);
    const value = this.host.variables.get(key);
    if (value === undefined) {
      if (lua.lua_gettop(state) >= 3) {
        lua.lua_pushvalue(state, 3);
      } else {
        lua.lua_pushnil(state);
      }
    } else {
      pushLuaValue(state, value);
    }
    return 1;
  }

  private set(state: LuaState): number {
    const key = readStateKey(state);
    if (lua.lua_gettop(state) < 3) {
      throw new TypeError("set requires a value");
    }
    this.host.variables.set(key, readLuaValue(state, 3));
    return 0;
  }

  private add(state: LuaState): number {
    const key = readStateKey(state);
    if (lua.lua_type(state, 3) !== lua.LUA_TNUMBER) {
      throw new TypeError("amount must be a finite number");
    }
    const amount = Number(lua.lua_tonumber(state, 3));
    if (!Number.isFinite(amount)) {
      throw new TypeError("amount must be a finite number");
    }
    const current = this.host.variables.get(key);
    if (current !== undefined && typeof current !== "number") {
      throw new TypeError(`variable '${key}' is not a number`);
    }
    const next = (current ?? 0) + amount;
    this.host.variables.set(key, next);
    lua.lua_pushnumber(state, next);
    return 1;
  }

  private has(state: LuaState): number {
    lua.lua_pushboolean(state, this.host.variables.has(readStateKey(state)));
    return 1;
  }

  private remove(state: LuaState): number {
    this.host.variables.delete(readStateKey(state));
    return 0;
  }
}
