/**
 * 单场景执行完成时返回的结果。
 *
 * 结果故意只包含本场景声明的出口名，而不携带下一个场景 ID 或 Lua 文件路径。
 * 这样 Lua、SceneExecutor 和 RouteTable 的职责保持分离：包级 StoryRunner 才能
 * 根据当前场景与出口解析后续路线。
 */

/** Lua 场景通过 ctx.flow:exit(port) 返回一个已声明的命名出口。 */
export interface SceneExit {
  type: "exit";
  /** 当前场景的本地出口名，例如 "accept"；它不是目标场景 ID。 */
  port: string;
}

/** Lua 场景通过 ctx.flow:end_story() 主动结束整个故事。 */
export interface SceneEnd {
  type: "end";
}

/** SceneExecutor 的正常完成结果；运行错误和取消仍通过异常或 AbortSignal 表达。 */
export type SceneResult = SceneExit | SceneEnd;
