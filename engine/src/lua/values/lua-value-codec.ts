import { lua, to_jsstring, to_luastring } from "fengari";
import type { VariableSchema } from "../../variables";
import type { LuaValue } from "./lua-types";

type LuaState = any;

const MAX_CODEC_DEPTH = 32;

function codecError(message: string): Error {
  return new TypeError(`Lua value error: ${message}`);
}

export function pushLuaValue(state: LuaState, value: LuaValue): void {
  if (value === null) {
    lua.lua_pushnil(state);
    return;
  }

  switch (typeof value) {
    case "boolean":
      lua.lua_pushboolean(state, value);
      return;
    case "number":
      if (!Number.isFinite(value)) {
        throw codecError("numbers must be finite");
      }
      lua.lua_pushnumber(state, value);
      return;
    case "string":
      lua.lua_pushstring(state, to_luastring(value));
      return;
    case "object":
      pushTable(state, value, 0);
      return;
    default:
      throw codecError(`unsupported JavaScript value: ${typeof value}`);
  }
}

function pushTable(state: LuaState, value: LuaValue[] | { [key: string]: LuaValue }, depth: number): void {
  if (depth > MAX_CODEC_DEPTH) {
    throw codecError("table nesting is too deep");
  }

  lua.lua_newtable(state);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      pushLuaValueAtDepth(state, item, depth + 1);
      lua.lua_seti(state, -2, index + 1);
    });
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    pushLuaValueAtDepth(state, item, depth + 1);
    lua.lua_setfield(state, -2, to_luastring(key));
  }
}

function pushLuaValueAtDepth(state: LuaState, value: LuaValue, depth: number): void {
  if (value !== null && typeof value === "object") {
    pushTable(state, value, depth);
  } else {
    pushLuaValue(state, value);
  }
}

export function readLuaValue(state: LuaState, index: number, depth = 0, schema?: VariableSchema): LuaValue {
  if (depth > MAX_CODEC_DEPTH) {
    throw codecError("table nesting is too deep");
  }

  const type = lua.lua_type(state, index);
  switch (type) {
    case lua.LUA_TNIL:
      return null;
    case lua.LUA_TBOOLEAN:
      return Boolean(lua.lua_toboolean(state, index));
    case lua.LUA_TNUMBER: {
      const value = Number(lua.lua_tonumber(state, index));
      if (!Number.isFinite(value)) {
        throw codecError("Lua returned a non-finite number");
      }
      return value;
    }
    case lua.LUA_TSTRING: {
      const value = lua.lua_tojsstring(state, index);
      return typeof value === "string" ? value : to_jsstring(lua.lua_tolstring(state, index));
    }
    case lua.LUA_TTABLE:
      return readTable(state, index, depth + 1, schema);
    default:
      throw codecError(`unsupported Lua value type ${String(type)}`);
  }
}

function readTable(state: LuaState, index: number, depth: number, schema?: VariableSchema): LuaValue {
  const absoluteIndex = lua.lua_absindex(state, index);
  const entries = new Map<string, LuaValue>();
  let onlyContiguousIntegers = true;
  let largestInteger = 0;

  lua.lua_pushnil(state);
  while (lua.lua_next(state, absoluteIndex) !== 0) {
    const keyType = lua.lua_type(state, -2);
    let key: string;
    if (keyType === lua.LUA_TSTRING) {
      key = String(lua.lua_tojsstring(state, -2));
      onlyContiguousIntegers = false;
      if (schema?.type === "array") {
        throw codecError("array table keys must be positive contiguous integers");
      }
    } else if (keyType === lua.LUA_TNUMBER && lua.lua_isinteger(state, -2)) {
      const integerKey = Number(lua.lua_tointeger(state, -2));
      key = String(integerKey);
      largestInteger = Math.max(largestInteger, integerKey);
      if (integerKey < 1) {
        onlyContiguousIntegers = false;
      }
      if (schema?.type === "object") {
        throw codecError("object table keys must be strings");
      }
    } else {
      throw codecError("table keys must be strings or positive integers");
    }

    const childSchema = schema?.type === "array"
      ? schema.items
      : schema?.type === "object" && Object.prototype.hasOwnProperty.call(schema.properties, key)
        ? schema.properties[key]
        : undefined;
    entries.set(key, readLuaValue(state, -1, depth, childSchema));
    lua.lua_pop(state, 1);
  }

  if (schema?.type === "array") {
    if (!onlyContiguousIntegers) {
      throw codecError("array table keys must be positive contiguous integers");
    }
    const result: LuaValue[] = [];
    for (let indexValue = 1; indexValue <= largestInteger; indexValue += 1) {
      const key = String(indexValue);
      if (!entries.has(key)) {
        throw codecError("array table keys must be positive contiguous integers");
      }
      result.push(entries.get(key) as LuaValue);
    }
    return result;
  }

  if (schema?.type === "object") {
    const result: { [key: string]: LuaValue } = {};
    for (const [key, value] of entries) {
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
    }
    return result;
  }

  if (onlyContiguousIntegers && largestInteger > 0) {
    const result: LuaValue[] = [];
    for (let indexValue = 1; indexValue <= largestInteger; indexValue += 1) {
      const key = String(indexValue);
      if (!entries.has(key)) {
        onlyContiguousIntegers = false;
        break;
      }
      result.push(entries.get(key) as LuaValue);
    }
    if (onlyContiguousIntegers) {
      return result;
    }
  }

  const result: { [key: string]: LuaValue } = {};
  for (const [key, value] of entries) {
    Object.defineProperty(result, key, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    });
  }
  return result;
}

export function isLuaTable(state: LuaState, index: number): boolean {
  return lua.lua_type(state, index) === lua.LUA_TTABLE;
}

export function readRequiredString(state: LuaState, index: number, name: string): string {
  if (lua.lua_type(state, index) !== lua.LUA_TSTRING) {
    throw new TypeError(`${name} must be a string`);
  }
  return String(lua.lua_tojsstring(state, index));
}

export function readOptionalString(state: LuaState, index: number, name: string): string | null {
  if (lua.lua_isnil(state, index)) {
    return null;
  }
  return readRequiredString(state, index, name);
}
