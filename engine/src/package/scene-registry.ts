/** 已加载场景定义的查询接口占位。 */
export interface SceneRegistry {
  get(id: string): import("../scene/scene-definition").SceneDefinition | undefined;
}
