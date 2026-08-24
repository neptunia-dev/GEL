import type { LuaApiHost, LuaApiMethod, LuaApiMethodKind, LuaState } from "./api-types";
import { raiseLuaBindingError } from "../errors/lua-error";
import { normalizeLuaApiError } from "../errors/lua-api-error";
import { isYieldTransfer } from "./binding-utils";

/** 所有 Lua 命名空间 API 的统一基类。 */
export abstract class LuaApi {
  public abstract readonly namespace: string;
  public abstract readonly capability: string;
  private readonly registeredMethods = new Map<string, LuaApiMethod>();

  public constructor(protected readonly host: LuaApiHost) {}

  public methods(): readonly LuaApiMethod[] {
    return [...this.registeredMethods.values()];
  }

  /** 在当前 API 类中注册一个可被 Lua 调用的方法。 */
  protected expose(
    name: string,
    kind: LuaApiMethodKind,
    invoke: (state: LuaState) => number,
  ): void {
    if (this.registeredMethods.has(name)) {
      throw new Error(`Lua API method '${this.namespace}.${name}' is already registered`);
    }
    this.registeredMethods.set(name, {
      name,
      kind,
      invoke: (state) => {
        try {
          return invoke.call(this, state);
        } catch (error) {
          // Fengari 的 yield 是控制转移，不属于 API 错误，必须原样抛回 VM。
          if (isYieldTransfer(error)) {
            throw error;
          }
          const path = `ctx.${this.namespace}.${name}`;
          const apiError = normalizeLuaApiError(path, error);
          return raiseLuaBindingError(state, apiError.message);
        }
      },
    });
  }
}
