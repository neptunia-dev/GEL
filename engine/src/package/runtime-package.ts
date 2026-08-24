/** 编辑器编译后供引擎读取的最小运行时包描述。 */
export interface RuntimePackage {
  entryScene: string;
  scenes: readonly import("../scene/scene-definition").SceneDefinition[];
  routes: Readonly<Record<string, Readonly<Record<string, string>>>>;
}
