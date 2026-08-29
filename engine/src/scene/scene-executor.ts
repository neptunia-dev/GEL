import type { Scene } from "./scene";
import type { SceneResult } from "./scene-result";

/**
 * 单场景执行器的接口。
 *
 * 调用方先在 package 层按场景 ID 取得已验证的 Scene，再把它交给执行器；
 * 因此执行器不需要自行查询场景注册表，也不会把“按 ID 查场景”和“运行 Lua”
 * 混成一个职责。
 *
 * 具体实现通常会在构造时注入 LuaRuntime、脚本来源、GameState、输入处理器和
 * 表现命令接收器。它们不放在 Scene 上，避免静态场景定义携带一次会话的可变状态。
 * execute 只负责运行当前场景，不解析出口路由，也不启动下一个场景；这些职责属于
 * 后续的 StoryRunner。
 */
export interface SceneExecutor {
  execute(scene: Scene): Promise<SceneResult>;
}
