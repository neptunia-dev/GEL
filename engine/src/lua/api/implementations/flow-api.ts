import { LuaApi } from "../api-base";
import type { LuaApiHost, LuaState } from "../api-types";
import { pushLuaValue, readRequiredString } from "../../values/lua-value-codec";
import { requireIdentifier } from "../../protocol/validators";

/** 场景流程领域的 Lua API。 */
export class FlowApi extends LuaApi {
  public readonly namespace = "flow";
  public readonly capability = "flow";

  public constructor(host: LuaApiHost) {
    super(host);
    this.expose("exit", "sync", this.exit);
    this.expose("end_story", "sync", this.endStory);
  }

  private exit(state: LuaState): number {
    const port = requireIdentifier(readRequiredString(state, 2, "port"), "port");
    if (this.host.exits !== undefined && this.host.exits.size > 0 && !this.host.exits.has(port)) {
      throw new RangeError(`Scene does not declare exit port '${port}'`);
    }
    pushLuaValue(state, { type: "exit", port });
    return 1;
  }

  private endStory(state: LuaState): number {
    pushLuaValue(state, { type: "end" });
    return 1;
  }
}
