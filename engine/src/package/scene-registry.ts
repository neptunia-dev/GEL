import { Scene } from "../scene/scene";
import { requireSceneId, type SceneId } from "../scene/scene-id";
import type { SceneDefinition } from "../scene/scene-definition";

/**
 * 已加载、已验证场景的只读注册表。
 *
 * 注册表只管理整个包中的 Scene 集合；脚本读取、Lua 执行和路由解析分别属于
 * LoadedRuntimePackage、SceneExecutor 和 RouteTable。
 */
export class SceneRegistry {
  private readonly scenesById = new Map<SceneId, Scene>();

  public constructor(scenes: readonly Scene[]) {
    if (!Array.isArray(scenes)) {
      throw new TypeError("scenes must be an array");
    }
    for (const [index, scene] of scenes.entries()) {
      if (!(scene instanceof Scene)) {
        throw new TypeError(`scenes[${index}] must be a Scene`);
      }
      if (this.scenesById.has(scene.id)) {
        throw new TypeError(`Duplicate scene ID '${scene.id}'`);
      }
      this.scenesById.set(scene.id, scene);
    }
  }

  /** 按稳定 ID 查询场景；未知 ID 返回 undefined。 */
  public get(id: SceneId): Scene | undefined {
    return this.scenesById.get(requireSceneId(id));
  }

  /** 判断场景是否已登记。 */
  public has(id: SceneId): boolean {
    return this.get(id) !== undefined;
  }

  /** 按稳定 ID 要求场景存在。 */
  public require(id: SceneId): Scene {
    const scene = this.get(id);
    if (scene === undefined) {
      throw new RangeError(`Unknown scene '${id}'`);
    }
    return scene;
  }

  /** 返回场景实例的独立数组；Scene 本身保持不可变。 */
  public all(): readonly Scene[] {
    return [...this.scenesById.values()];
  }

  /** 返回规范化场景定义的独立副本。 */
  public get definitions(): readonly SceneDefinition[] {
    return this.all().map((scene) => scene.toDefinition());
  }

  /** 导出规范化场景定义；便于包对象生成 manifest 副本。 */
  public toDefinitions(): readonly SceneDefinition[] {
    return this.definitions;
  }
}
