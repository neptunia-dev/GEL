/**
 * 场景加载器的接口占位。
 *
 * 具体的文件系统、压缩包或内存实现放在 package/platform 层，
 * 引擎只依赖这个抽象接口。
 */
export interface SceneLoader {
  load(id: string): Promise<import("./scene-definition").SceneDefinition>;
}
