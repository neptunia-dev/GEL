import { lua } from "fengari";
import { requireIdentifier } from "../protocol/validators";
import type { LuaCapability, LuaValue } from "../values/lua-types";
import { readLuaValue, readRequiredString } from "../values/lua-value-codec";
import type { LuaPresentationCommand } from "../protocol/presentation-command";
import type { LuaApiHost } from "./api-types";

export type LuaState = any;
export type LuaObject = { [key: string]: LuaValue };
export type LuaBindingHost = LuaApiHost;

export const ALL_CAPABILITIES: readonly LuaCapability[] = ["dialogue", "stage", "state", "flow", "time"];

export function isYieldTransfer(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: unknown }).status === lua.LUA_YIELD &&
    "previous" in error
  );
}

export function emit(host: LuaBindingHost, command: LuaPresentationCommand): void {
  host.emit?.(command);
}

export function readStateKey(state: LuaState): string {
  return requireIdentifier(readRequiredString(state, 2, "key"), "key");
}

export function readCharacterId(state: LuaState, host: LuaBindingHost, index: number): string {
  const characterId = requireIdentifier(readRequiredString(state, index, "characterId"), "characterId");
  requireCharacter(host, characterId);
  return characterId;
}

export function requireCharacter(host: LuaBindingHost, characterId: string): void {
  if (host.characterIds !== undefined && host.characterIds.size > 0 && !host.characterIds.has(characterId)) {
    throw new RangeError(`Character '${characterId}' is not declared in this scene`);
  }
}

export function readObjectArgument(state: LuaState, index: number, name: string): LuaObject {
  if (lua.lua_gettop(state) < index || lua.lua_isnil(state, index)) {
    throw new TypeError(`${name} must be a table`);
  }
  const value = readLuaValue(state, index);
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new TypeError(`${name} must be an object table`);
  }
  return value;
}

export function readOptionalObjectString(object: LuaObject, field: string, name: string): string | undefined {
  const value = object[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string`);
  }
  return value;
}

export function readSide(value: LuaValue | undefined, name: string): "left" | "right" {
  if (value !== "left" && value !== "right") {
    throw new TypeError(`${name} must be 'left' or 'right'`);
  }
  return value;
}
