/** 角色在游戏工程中的稳定标识。 */
export type CharacterId = string;

/**
 * 角色的静态定义。
 *
 * 这里保存的是角色身份资料，不保存好感度、当前表情或立绘状态。
 * 这些运行时状态分别属于剧情变量和表现层。
 */
export interface CharacterDefinition {
  /** 在整个游戏工程中唯一的角色 ID，例如 `alice`。 */
  id: CharacterId;
  /** 默认显示名称，例如 `爱丽丝`。 */
  name: string;
  /** 可用于日志、脚本工具或本地化查找的其他称呼。 */
  aliases?: readonly string[];
  /** 用于编辑器筛选和后续扩展的标签。 */
  tags?: readonly string[];
}

/**
 * 场景系统中的角色领域对象。
 *
 * Character 只描述“这个角色是谁”，不依赖 Lua、TUI 或具体渲染器。
 * 构造完成后对象保持只读，适合作为场景注册表中的长期对象复用。
 */
export class Character {
  public readonly id: CharacterId;
  public readonly name: string;
  public readonly aliases: readonly string[];
  public readonly tags: readonly string[];

  public constructor(definition: CharacterDefinition) {
    this.id = normalizeRequiredText(definition.id, "Character id");
    this.name = normalizeRequiredText(definition.name, "Character name");
    this.aliases = normalizeTextList(definition.aliases ?? [], "Character aliases");
    this.tags = normalizeTextList(definition.tags ?? [], "Character tags");
  }

  /**
   * 判断一个输入是否是该角色的 ID、显示名或别名。
   *
   * 调用方可以传入用户输入，因此这里会忽略首尾空白；不会做大小写
   * 折叠，以免中文名或区分大小写的角色 ID 产生歧义。
   */
  public matches(value: string): boolean {
    const normalizedValue = normalizeRequiredText(value, "Character lookup value");
    return (
      normalizedValue === this.id ||
      normalizedValue === this.name ||
      this.aliases.includes(normalizedValue)
    );
  }

  /** 判断角色是否包含指定标签。 */
  public hasTag(tag: string): boolean {
    const normalizedTag = normalizeRequiredText(tag, "Character tag");
    return this.tags.includes(normalizedTag);
  }

  /**
   * 导出为可序列化的普通对象。
   *
   * 数组会重新复制，避免调用方修改导出结果时影响角色对象本身。
   */
  public toDefinition(): CharacterDefinition {
    return {
      id: this.id,
      name: this.name,
      aliases: [...this.aliases],
      tags: [...this.tags],
    };
  }
}

function normalizeRequiredText(value: string, fieldName: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${fieldName} must be a string`);
  }

  const normalizedValue = value.trim();
  if (normalizedValue.length === 0) {
    throw new Error(`${fieldName} cannot be empty`);
  }

  return normalizedValue;
}

function normalizeTextList(values: readonly string[], fieldName: string): readonly string[] {
  const uniqueValues = new Set<string>();
  for (const value of values) {
    uniqueValues.add(normalizeRequiredText(value, fieldName));
  }
  return [...uniqueValues];
}
