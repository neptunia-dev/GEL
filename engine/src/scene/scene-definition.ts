/**
 * 场景中角色的局部绑定信息。
 *
 * 这只是该场景允许引用角色的静态声明；角色是否已登场、位置、表情和焦点
 * 都属于表现层运行状态，不能写回该 DTO。
 */
export interface SceneCastMember {
  /** 指向全局角色注册表中的稳定角色 ID。 */
  characterId: string;
  /** 角色在本场景中的叙事身份，可供编辑器和表现层显示。 */
  role?: string;
  /** 本场景需要时使用的显示名覆盖，不改变全局角色定义。 */
  displayName?: string;
}

/**
 * 场景的原始、可序列化定义。
 *
 * 该 DTO 用于编辑器输出和包清单，不保证字段已经规范化或可安全执行。
 * 包加载阶段应将它转换为 {@link Scene}，运行期代码只依赖后者。
 */
export interface SceneDefinition {
  /** 稳定场景 ID；运行期会校验其格式，不使用显示标题代替。 */
  id: string;
  /**
   * 场景唯一 Lua 主入口在游戏包中的相对路径。
   *
   * 该字段必须显式指向某个场景目录下的 `main.lua`，不会根据 id 自动拼接。
   * 这样场景目录可以重组而不改变稳定场景 ID，清单也能直接暴露实际入口。
   */
  mainScript: string;
  /** 可选的玩家可见场景标题；不参与路由或脚本定位。 */
  title?: string;
  /** 本场景声明的可登台角色引用；缺失时运行期规范化为 []。 */
  cast?: readonly SceneCastMember[];
  /** 可选的命名出口声明；缺失时运行期规范化为 []，即只能结束故事。 */
  exits?: readonly string[];
}
