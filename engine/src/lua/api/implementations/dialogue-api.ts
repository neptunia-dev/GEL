import { lua, to_luastring } from "fengari";
import { LuaApi } from "../api-base";
import type { LuaState } from "../api-types";
import { pushLuaValue, readRequiredString, isLuaTable } from "../../values/lua-value-codec";
import type { LuaChoiceOption, LuaDialogueRequest, LuaRequest } from "../../protocol/lua-request";
import { requireIdentifier } from "../../protocol/validators";
import type { LuaValue } from "../../values/lua-types";

/** 对话领域的 Lua API。 */
export class DialogueApi extends LuaApi {
  public readonly namespace = "dialogue";
  public readonly capability = "dialogue";

  public constructor(host: import("../api-types").LuaApiHost) {
    super(host);
    this.expose("say", "request", this.say);
    this.expose("monologue", "request", this.monologue);
    this.expose("narrate", "request", this.narrate);
    this.expose("offscreen", "request", this.offscreen);
    this.expose("choice", "request", this.choice);
  }

  private say(state: LuaState): number {
    return this.yieldRequest(state, {
      type: "dialogue",
      mode: "character",
      speaker: requireIdentifier(readRequiredString(state, 2, "speaker"), "speaker"),
      text: readRequiredString(state, 3, "text"),
    });
  }

  private monologue(state: LuaState): number {
    return this.yieldRequest(state, {
      type: "dialogue",
      mode: "monologue",
      speaker: null,
      text: readRequiredString(state, 2, "text"),
    });
  }

  private narrate(state: LuaState): number {
    return this.yieldRequest(state, {
      type: "dialogue",
      mode: "narration",
      speaker: null,
      text: readRequiredString(state, 2, "text"),
    });
  }

  private offscreen(state: LuaState): number {
    const speaker = requireIdentifier(readRequiredString(state, 2, "speaker"), "speaker");
    const text = readRequiredString(state, 3, "text");
    const speakerName = this.readOptionalSpeakerName(state);
    return this.yieldRequest(
      state,
      speakerName === undefined
        ? { type: "dialogue", mode: "offscreen", speaker, text }
        : { type: "dialogue", mode: "offscreen", speaker, speakerName, text },
    );
  }

  private choice(state: LuaState): number {
    return this.yieldRequest(state, { type: "choice", options: this.readChoiceOptions(state, 2) });
  }

  private readOptionalSpeakerName(state: LuaState): string | undefined {
    if (lua.lua_gettop(state) < 4 || lua.lua_isnil(state, 4)) {
      return undefined;
    }
    if (!isLuaTable(state, 4)) {
      throw new TypeError("options must be a table");
    }
    lua.lua_getfield(state, 4, to_luastring("speakerName"));
    if (lua.lua_isnil(state, -1)) {
      lua.lua_pop(state, 1);
      return undefined;
    }
    const value = readRequiredString(state, -1, "options.speakerName");
    lua.lua_pop(state, 1);
    return value;
  }

  private readChoiceOptions(state: LuaState, index: number): LuaChoiceOption[] {
    if (!isLuaTable(state, index)) {
      throw new TypeError("options must be an array table");
    }

    const options: LuaChoiceOption[] = [];
    const seen = new Set<string>();
    for (let itemIndex = 1; ; itemIndex += 1) {
      const itemType = lua.lua_geti(state, index, itemIndex);
      if (itemType === lua.LUA_TNIL) {
        lua.lua_pop(state, 1);
        break;
      }
      if (!isLuaTable(state, -1)) {
        lua.lua_pop(state, 1);
        throw new TypeError(`options[${itemIndex}] must be a table`);
      }

      const id = requireIdentifier(
        this.readRequiredFieldString(state, -1, "id", `options[${itemIndex}].id`),
        `options[${itemIndex}].id`,
      );
      if (seen.has(id)) {
        lua.lua_pop(state, 1);
        throw new TypeError(`duplicate choice option id '${id}'`);
      }
      seen.add(id);
      const text = this.readRequiredFieldString(state, -1, "text", `options[${itemIndex}].text`);
      lua.lua_getfield(state, -1, to_luastring("enabled"));
      const enabledType = lua.lua_type(state, -1);
      let enabled = true;
      if (enabledType !== lua.LUA_TNIL) {
        if (enabledType !== lua.LUA_TBOOLEAN) {
          lua.lua_pop(state, 2);
          throw new TypeError(`options[${itemIndex}].enabled must be a boolean`);
        }
        enabled = Boolean(lua.lua_toboolean(state, -1));
      }
      lua.lua_pop(state, 1); // enabled 值
      lua.lua_pop(state, 1); // option 表
      options.push({ id, text, enabled });
    }

    if (options.length === 0) {
      throw new TypeError("options must contain at least one item");
    }
    return options;
  }

  private readRequiredFieldString(state: LuaState, tableIndex: number, field: string, name: string): string {
    lua.lua_getfield(state, tableIndex, to_luastring(field));
    const value = readRequiredString(state, -1, name);
    lua.lua_pop(state, 1);
    return value;
  }

  private yieldRequest(state: LuaState, request: LuaRequest): number {
    pushLuaValue(state, request as unknown as LuaValue);
    return lua.lua_yield(state, 1);
  }
}
