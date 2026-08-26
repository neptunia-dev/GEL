import type { LuaPresentationCommand } from "../protocol/presentation-command";
import type { LuaCapability } from "../values/lua-types";
import type { VariableStore } from "../../variables";
import type { LuaApi } from "./api-base";

/** Fengari 的 Lua 状态句柄；项目不直接依赖其内部泛型。 */
export type LuaState = any;

/** 每次场景运行使用的共享游戏状态宿主。 */
export interface LuaApiHost {
  readonly variables: VariableStore;
  readonly characterIds?: ReadonlySet<string>;
  readonly exits?: ReadonlySet<string>;
  readonly capabilities?: ReadonlySet<LuaCapability>;
  readonly emit?: (command: LuaPresentationCommand) => void;
}

/** 自定义 API 的工厂；每次场景运行创建新的 API 实例。 */
export type LuaApiFactory = (host: LuaApiHost) => LuaApi;

export type LuaApiMethodKind = "sync" | "command" | "request";

export interface LuaApiMethod {
  readonly name: string;
  readonly kind: LuaApiMethodKind;
  readonly invoke: (state: LuaState) => number;
}
