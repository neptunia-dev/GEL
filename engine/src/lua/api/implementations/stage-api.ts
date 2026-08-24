import { lua } from "fengari";
import { LuaApi } from "../api-base";
import type { LuaApiHost, LuaState } from "../api-types";
import type { LuaStageShowCommand, LuaPresentationCommand } from "../../protocol/presentation-command";
import { readOptionalString, readRequiredString } from "../../values/lua-value-codec";
import {
  emit,
  readCharacterId,
  readObjectArgument,
  readOptionalObjectString,
  readSide,
  requireCharacter,
} from "../binding-utils";
import { requireIdentifier } from "../../protocol/validators";

/** 舞台角色领域的 Lua API。 */
export class StageApi extends LuaApi {
  public readonly namespace = "stage";
  public readonly capability = "stage";

  public constructor(host: LuaApiHost) {
    super(host);
    this.expose("show", "command", this.showCharacter);
    this.expose("hide", "command", this.hideCharacter);
    this.expose("move", "command", this.moveCharacter);
    this.expose("focus", "command", this.focusCharacter);
  }

  private showCharacter(state: LuaState): number {
    const characterId = readCharacterId(state, this.host, 2);
    const options = readObjectArgument(state, 3, "options");
    const command: LuaStageShowCommand = {
      kind: "stage.show",
      characterId,
      side: readSide(options.side, "options.side"),
    };
    const role = readOptionalObjectString(options, "role", "options.role");
    const displayName = readOptionalObjectString(options, "displayName", "options.displayName");
    const expression = readOptionalObjectString(options, "expression", "options.expression");
    if (role !== undefined) command.role = role;
    if (displayName !== undefined) command.displayName = displayName;
    if (expression !== undefined) command.expression = expression;
    emit(this.host, command);
    return 0;
  }

  private hideCharacter(state: LuaState): number {
    const command: LuaPresentationCommand = {
      kind: "stage.hide",
      characterId: readCharacterId(state, this.host, 2),
    };
    emit(this.host, command);
    return 0;
  }

  private moveCharacter(state: LuaState): number {
    const command: LuaPresentationCommand = {
      kind: "stage.move",
      characterId: readCharacterId(state, this.host, 2),
      side: readSide(readRequiredString(state, 3, "side"), "side"),
    };
    emit(this.host, command);
    return 0;
  }

  private focusCharacter(state: LuaState): number {
    if (lua.lua_gettop(state) < 2) {
      throw new TypeError("characterId is required; use nil to clear focus");
    }
    const characterId = readOptionalString(state, 2, "characterId");
    if (characterId !== null) {
      requireCharacter(this.host, requireIdentifier(characterId, "characterId"));
    }
    emit(this.host, { kind: "stage.focus", characterId });
    return 0;
  }
}
