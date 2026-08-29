import { VirtualPath } from "../filesystem";
import type { SceneCastMember, SceneDefinition } from "./scene-definition";
import { requireSceneId, type SceneId } from "./scene-id";

/**
 * 已验证、不可变的单个剧情节点。
 *
 * Scene 只描述本场景的静态边界：稳定 ID、包内 main.lua 入口、可登台角色和
 * 声明出口。它不读取主入口、不解析路由、不持有 Lua coroutine，也不保存
 * 表现层状态或剧情变量。
 */
export class Scene {
  public readonly id: SceneId;
  /** 玩家可见的场景标题；不参与路由或脚本定位。 */
  public readonly title: string | undefined;
  /** 场景唯一可执行的 Lua 主入口；必须是场景目录中的 main.lua。 */
  public readonly mainScriptPath: VirtualPath;
  private readonly castMembers: readonly SceneCastMember[];
  private readonly exitPorts: readonly string[];

  public constructor(definition: SceneDefinition) {
    // SceneDefinition 通常来自 JSON 清单或编辑器输出，进入运行期前不能假定其结构可信。
    if (definition === null || typeof definition !== "object" || Array.isArray(definition)) {
      throw new TypeError("Scene definition must be an object");
    }

    // 这里一次性完成规范化，之后执行器不需要反复处理可选数组、路径分隔符或重复项。
    this.id = requireSceneId(definition.id, "Scene ID");
    this.title = normalizeOptionalText(definition.title, "Scene title");
    this.mainScriptPath = normalizeMainScriptPath(definition.mainScript);
    this.castMembers = freezeCast(normalizeCast(definition.cast));
    this.exitPorts = Object.freeze(normalizeExitPorts(definition.exits));
  }

  /**
   * 返回场景角色表的独立副本。
   *
   * Scene 不向调用方暴露其内部数组或成员对象；展示层可以自由修改返回值
   * 以构造自身 view model，而不会改变场景定义。
   */
  public get cast(): readonly SceneCastMember[] {
    return this.castMembers.map(cloneCastMember);
  }

  /** 返回声明出口的独立副本。空数组表示该场景只能结束故事。 */
  public get exits(): readonly string[] {
    return [...this.exitPorts];
  }

  /** 当前场景是否声明了指定出口。 */
  public hasExit(port: string): boolean {
    return this.exitPorts.includes(normalizeRequiredText(port, "Scene exit port"));
  }

  /** 当前场景是否允许指定角色执行舞台操作。 */
  public hasCharacter(characterId: string): boolean {
    return this.castMembers.some((member) => member.characterId === normalizeRequiredText(characterId, "Character ID"));
  }

  /** 返回一个场景局部角色绑定的独立副本；未声明时返回 undefined。 */
  public getCastMember(characterId: string): SceneCastMember | undefined {
    const member = this.castMembers.find(
      (candidate) => candidate.characterId === normalizeRequiredText(characterId, "Character ID"),
    );
    return member === undefined ? undefined : cloneCastMember(member);
  }

  /** 返回可直接传给 Lua runtime 的角色 ID 列表副本。 */
  public getCharacterIds(): readonly string[] {
    return this.castMembers.map((member) => member.characterId);
  }

  /** 导出规范化后的可序列化场景定义。 */
  public toDefinition(): SceneDefinition {
    return {
      id: this.id,
      mainScript: this.mainScriptPath.value,
      ...(this.title === undefined ? {} : { title: this.title }),
      cast: this.cast,
      exits: this.exits,
    };
  }
}

/**
 * mainScript 字段只表示游戏包内部的逻辑路径，而不是宿主操作系统路径。
 *
 * 每个场景显式声明自己的 main.lua，避免通过场景 ID 隐式拼接文件名，也让场景
 * 目录可以自然容纳未来的局部 Lua 模块和资源。VirtualPath 会统一 Windows/POSIX
 * 分隔符并拒绝绝对路径、NUL 字符和越出包根的路径。文件是否存在、是否为 UTF-8、
 * 是否能编译仍属于 package 加载阶段，因为 Scene 本身不持有文件系统。
 */
function normalizeMainScriptPath(value: unknown): VirtualPath {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim() !== value) {
    throw new TypeError("Scene mainScript must be a non-empty path without surrounding whitespace");
  }
  const path = VirtualPath.parse(value);
  if (path.basename() !== "main.lua") {
    throw new TypeError("Scene mainScript must point to a main.lua file");
  }
  // 主入口放在目录中，保证它归属于一个场景，而不是误把整个包的根文件当作场景。
  const parent = path.parent();
  if (parent === null || parent.isRoot) {
    throw new TypeError("Scene mainScript must be stored inside a scene directory");
  }
  return path;
}

/**
 * cast 是本场景可执行 ctx.stage:* 操作的角色白名单，不是当前已经登场的角色。
 * 未声明 cast 时统一使用空数组，使执行器可以无分支地将角色 ID 传给 Lua runtime。
 */
function normalizeCast(value: unknown): SceneCastMember[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new TypeError("Scene cast must be an array");
  }

  const characterIds = new Set<string>();
  return value.map((member, index) => {
    const path = `Scene cast[${index}]`;
    if (member === null || typeof member !== "object" || Array.isArray(member)) {
      throw new TypeError(`${path} must be an object`);
    }

    const characterId = normalizeRequiredText(member.characterId, `${path}.characterId`);
    // 先 trim 再判重，避免 "alice" 与 " alice " 绕过局部角色唯一性约束。
    if (characterIds.has(characterId)) {
      throw new TypeError(`Scene cast contains duplicate character ID '${characterId}'`);
    }
    characterIds.add(characterId);

    const role = normalizeOptionalText(member.role, `${path}.role`);
    const displayName = normalizeOptionalText(member.displayName, `${path}.displayName`);
    return {
      characterId,
      ...(role === undefined ? {} : { role }),
      ...(displayName === undefined ? {} : { displayName }),
    };
  });
}

/**
 * Scene 中缺省出口与显式空出口都规范为 []。这表示本场景没有命名出口，
 * 正式执行器传入该集合后，Lua 只能调用 ctx.flow:end_story()。
 */
function normalizeExitPorts(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new TypeError("Scene exits must be an array");
  }

  const ports = new Set<string>();
  for (const [index, valueAtIndex] of value.entries()) {
    const port = normalizeRequiredText(valueAtIndex, `Scene exits[${index}]`);
    // 与 cast 相同，按规范化值去重，避免空白差异产生两个语义相同的端口。
    if (ports.has(port)) {
      throw new TypeError(`Scene exits contains duplicate port '${port}'`);
    }
    ports.add(port);
  }
  return [...ports];
}

/**
 * 角色 ID、出口和显示元数据允许去除作者误输入的首尾空白。
 * 场景 ID 则不能复用此函数：它会出现在路由和存档中，必须由 requireSceneId
 * 严格拒绝空白，而不是静默改写引用关系。
 */
function normalizeRequiredText(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`${name} must not be empty`);
  }
  return normalized;
}

function normalizeOptionalText(value: unknown, name: string): string | undefined {
  return value === undefined ? undefined : normalizeRequiredText(value, name);
}

function cloneCastMember(member: SceneCastMember): SceneCastMember {
  return {
    characterId: member.characterId,
    ...(member.role === undefined ? {} : { role: member.role }),
    ...(member.displayName === undefined ? {} : { displayName: member.displayName }),
  };
}

/**
 * readonly 只是在 TypeScript 类型层限制写入；这里冻结内部数组和成员对象，
 * 防止 JavaScript 调用方通过类型断言修改场景。对外仍返回副本，避免把冻结
 * 行为泄漏给展示层或编辑器工具。
 */
function freezeCast(cast: readonly SceneCastMember[]): readonly SceneCastMember[] {
  return Object.freeze(cast.map((member) => Object.freeze(cloneCastMember(member))));
}
