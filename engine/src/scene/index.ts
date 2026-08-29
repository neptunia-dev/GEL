/**
 * 场景领域模块的稳定公共出口。
 *
 * 外部模块应从这里导入 Scene、SceneExecutor 和相关 DTO；不要依赖已删除的
 * scene-loader、scene-runner 等旧文件路径，以免后续 package/story 层扩展时
 * 再次把单场景模型与包级调度混在一起。
 */
export * from "./scene";
export * from "./scene-definition";
export * from "./scene-executor";
export * from "./scene-id";
export * from "./scene-result";
