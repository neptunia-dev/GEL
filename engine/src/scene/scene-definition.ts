/** 场景中角色的局部绑定信息。 */
export interface SceneCastMember {
  /** 指向全局角色注册表中的角色 ID。 */
  characterId: string;
  /** 角色在本场景中的身份，可供编辑器和 TUI 使用。 */
  role?: string;
  /** 本场景需要时使用的显示名覆盖。 */
  displayName?: string;
}

/** 可由运行时加载并执行的场景静态定义。 */
export interface SceneDefinition {
  id: string;
  /** Lua 脚本在游戏包中的相对路径。 */
  script: string;
  /** 本场景声明的角色引用。 */
  cast?: readonly SceneCastMember[];
  /** 可选的出口端口声明，用于加载阶段校验。 */
  exits?: readonly string[];
}
