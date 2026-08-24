import { LuaApiRegistry } from "./registry/lua-api-registry";
import { createCoreApis } from "./registry/core-api-catalog";
import { createDevelopmentApis } from "./registry/development-api-catalog";
import type { LuaApiFactory, LuaApiHost, LuaState } from "./api-types";

export type LuaBindingHost = LuaApiHost;
export type { LuaApiFactory, LuaApiHost, LuaState } from "./api-types";

/** 创建核心 API 注册器；每个场景运行都应创建独立实例。 */
export function createCoreLuaApiRegistry(host: LuaApiHost, factories: readonly LuaApiFactory[] = []): LuaApiRegistry {
  return new LuaApiRegistry([...createCoreApis(host), ...createDevelopmentApis(host, factories)]);
}

/** 在 coroutine 栈顶创建按能力分组的场景上下文。 */
export function installContext(
  state: LuaState,
  host: LuaApiHost,
  registry?: LuaApiRegistry,
  factories: readonly LuaApiFactory[] = [],
): void {
  const activeRegistry = registry ?? createCoreLuaApiRegistry(host, factories);
  const enabled = host.capabilities ?? activeRegistry.capabilities();
  activeRegistry.install(state, enabled);
}
