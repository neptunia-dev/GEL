/**
 * 场景执行器的接口占位。
 *
 * 真正的 Lua 调度会在 SceneDefinition 和 LuaRuntime 的契约确定后实现。
 */
export interface SceneRunner {
  run(id: string): Promise<import("./scene-exit").SceneResult>;
}
