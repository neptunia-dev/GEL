/** Lua 与宿主之间允许传递的可序列化值。 */
export type LuaValue =
  | null
  | boolean
  | number
  | string
  | LuaValue[]
  | { [key: string]: LuaValue };

/** Lua 运行时可以启用的上下文能力。 */
export type LuaCapability = "dialogue" | "stage" | "state" | "flow" | "time";
