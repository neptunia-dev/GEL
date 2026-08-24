import type { LuaRequest } from "./lua-request";
import type { LuaValue } from "../values/lua-types";

/** 宿主恢复 Lua 协程时传回的值。 */
export type LuaResumeValue = LuaValue | undefined;

/** 校验宿主回复是否符合当前请求。 */
export function validateLuaResponse(request: LuaRequest, response: LuaResumeValue): void {
  switch (request.type) {
    case "dialogue":
    case "wait":
      if (response !== undefined && response !== null) {
        throw new TypeError(`${request.type} request expects no response value`);
      }
      return;
    case "choice":
      if (typeof response !== "string") {
        throw new TypeError("choice request expects a string option ID");
      }
      if (!request.options.some((option) => option.id === response && option.enabled !== false)) {
        throw new RangeError(`Unknown or disabled choice option '${response}'`);
      }
      return;
  }
}
