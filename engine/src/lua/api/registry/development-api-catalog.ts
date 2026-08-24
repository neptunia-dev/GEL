import type { LuaApi } from "../api-base";
import type { LuaApiFactory, LuaApiHost } from "../api-types";

/** 开发期扩展 API 的唯一组装入口。 */
export function createDevelopmentApis(
  host: LuaApiHost,
  factories: readonly LuaApiFactory[] = [],
): readonly LuaApi[] {
  return factories.map((factory) => factory(host));
}
