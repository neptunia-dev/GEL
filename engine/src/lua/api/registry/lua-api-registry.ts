import { lua, to_luastring } from "fengari";
import { LuaApi } from "../api-base";

type LuaState = any;

/** 负责校验、能力裁剪和安装 Lua API 命名空间。 */
export class LuaApiRegistry {
  private readonly modules = new Map<string, LuaApi>();

  public constructor(modules: readonly LuaApi[] = []) {
    for (const module of modules) {
      this.register(module);
    }
  }

  public register(module: LuaApi): this {
    validateName(module.namespace, "namespace");
    if (this.modules.has(module.namespace)) {
      throw new Error(`Lua API namespace '${module.namespace}' is already registered`);
    }
    const methods = module.methods();
    if (methods.length === 0) {
      throw new Error(`Lua API namespace '${module.namespace}' must register at least one method`);
    }
    const names = new Set<string>();
    for (const method of methods) {
      validateName(method.name, `method in ${module.namespace}`);
      if (names.has(method.name)) {
        throw new Error(`Lua API method '${module.namespace}.${method.name}' is already registered`);
      }
      names.add(method.name);
    }
    this.modules.set(module.namespace, module);
    return this;
  }

  public install(state: LuaState, capabilities: ReadonlySet<string>): void {
    lua.lua_newtable(state);
    for (const module of this.modules.values()) {
      if (!capabilities.has(module.capability)) {
        continue;
      }
      this.installModule(state, module);
    }
  }

  public capabilities(): ReadonlySet<string> {
    return new Set([...this.modules.values()].map((module) => module.capability));
  }

  private installModule(rootState: LuaState, module: LuaApi): void {
    lua.lua_newtable(rootState);
    for (const method of module.methods()) {
      lua.lua_pushjsfunction(rootState, method.invoke);
      lua.lua_setfield(rootState, -2, to_luastring(method.name));
    }
    lua.lua_setfield(rootState, -2, to_luastring(module.namespace));
  }
}

function validateName(value: string, label: string): void {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid Lua API ${label} '${value}'`);
  }
}
