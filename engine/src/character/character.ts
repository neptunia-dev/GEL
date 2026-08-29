/** 角色在游戏工程中的稳定标识。 */
export type CharacterId = string;

/** 角色 ID 与包内其他稳定标识共用的 ASCII 规则。 */
export const CHARACTER_ID_PATTERN = /^[a-z][a-z0-9_.-]*$/;

/** 验证并返回稳定的角色 ID。 */
export function requireCharacterId(value: unknown, name = "Character ID"): CharacterId {
  if (typeof value !== "string" || !CHARACTER_ID_PATTERN.test(value)) {
    throw new TypeError(`${name} must match ${CHARACTER_ID_PATTERN.source}`);
  }
  return value;
}

/** 角色立绘在角色范围内的稳定标识。 */
export type CharacterPortraitId = string;

/**
 * 指向游戏包资源的逻辑引用。
 *
 * 它可以是资源 ID 或包内路径；Character 只保存和选择该引用，不读取文件、
 * 解码图片或依赖具体渲染器。
 */
export type CharacterAssetRef = string;

/** 单个可选立绘的声明。 */
export interface CharacterPortraitDefinition {
  /** 角色范围内唯一的立绘 ID，例如 `normal` 或 `school-smile`。 */
  id: CharacterPortraitId;
  /** 由资源层解析的逻辑资源引用。 */
  asset: CharacterAssetRef;
}

/**
 * 创建角色时使用的初始配置。
 *
 * 这是游戏包提供的配置，不是运行中的角色状态。Character 会从该配置创建
 * 可变的显示名和当前立绘状态；toDefinition() 也只导出这类可重新创建角色的
 * 配置数据。
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
  /** 角色可以切换到的立绘集合。 */
  portraits?: readonly CharacterPortraitDefinition[];
  /** 新建或重置角色时选中的立绘；未声明时初始状态没有立绘。 */
  defaultPortraitId?: CharacterPortraitId;
}

/**
 * 可保存和恢复的角色运行时状态。
 *
 * 舞台位置、可见性和焦点属于 Stage；这里仅保存跟随角色本身的显示名与当前
 * 立绘选择。
 */
export interface CharacterState {
  displayName: string;
  portraitId: CharacterPortraitId | null;
}

/**
 * 一个游戏会话中的角色实体。
 *
 * Character 保留稳定身份和可用立绘目录，同时管理会随剧情推进变化的显示名和
 * 当前立绘。它不加载资源、不持有图片对象，也不管理角色在舞台上的位置或可见
 * 性，因此可以由 TUI、GUI 或其他表现层共同使用。
 */
export class Character {
  public readonly id: CharacterId;
  public readonly name: string;
  public readonly aliases: readonly string[];
  public readonly tags: readonly string[];
  private readonly portraitDefinitions: readonly CharacterPortraitDefinition[];
  private readonly portraitsById: ReadonlyMap<CharacterPortraitId, CharacterPortraitDefinition>;
  private readonly initialPortraitId: CharacterPortraitId | null;
  private currentDisplayName: string;
  private currentPortraitId: CharacterPortraitId | null;

  public constructor(definition: CharacterDefinition) {
    if (definition === null || typeof definition !== "object" || Array.isArray(definition)) {
      throw new TypeError("Character definition must be an object");
    }

    this.id = requireCharacterId(definition.id, "Character id");
    this.name = normalizeRequiredText(definition.name, "Character name");
    this.aliases = Object.freeze(normalizeTextList(definition.aliases ?? [], "Character aliases"));
    this.tags = Object.freeze(normalizeTextList(definition.tags ?? [], "Character tags"));
    this.portraitDefinitions = freezePortraits(normalizePortraits(definition.portraits));
    this.portraitsById = new Map(this.portraitDefinitions.map((portrait) => [portrait.id, portrait]));
    this.initialPortraitId = normalizeInitialPortraitId(definition.defaultPortraitId, this.portraitsById);
    this.currentDisplayName = this.name;
    this.currentPortraitId = this.initialPortraitId;
  }

  /** 当前用于台词和表现层的显示名称；可以随剧情临时改变。 */
  public get displayName(): string {
    return this.currentDisplayName;
  }

  /** 当前选择的立绘 ID；null 表示此角色暂未选择立绘。 */
  public get portraitId(): CharacterPortraitId | null {
    return this.currentPortraitId;
  }

  /** 当前选择的立绘定义副本；没有选择时返回 null。 */
  public get portrait(): CharacterPortraitDefinition | null {
    return this.currentPortraitId === null ? null : this.getPortrait(this.currentPortraitId) ?? null;
  }

  /** 新建或 resetState() 后会选择的默认立绘 ID。 */
  public get defaultPortraitId(): CharacterPortraitId | null {
    return this.initialPortraitId;
  }

  /** 返回所有可用立绘的独立副本。 */
  public get portraits(): readonly CharacterPortraitDefinition[] {
    return this.portraitDefinitions.map(clonePortrait);
  }

  /**
   * 判断一个输入是否是该角色的 ID、默认名称、当前显示名称或别名。
   *
   * 调用方可以传入用户输入，因此这里会忽略首尾空白；不会做大小写折叠，
   * 以免中文名或区分大小写的角色 ID 产生歧义。
   */
  public matches(value: string): boolean {
    const normalizedValue = normalizeRequiredText(value, "Character lookup value");
    return (
      normalizedValue === this.id ||
      normalizedValue === this.name ||
      normalizedValue === this.currentDisplayName ||
      this.aliases.includes(normalizedValue)
    );
  }

  /** 判断角色是否包含指定标签。 */
  public hasTag(tag: string): boolean {
    return this.tags.includes(normalizeRequiredText(tag, "Character tag"));
  }

  /** 判断角色是否声明了指定立绘。 */
  public hasPortrait(portraitId: string): boolean {
    return this.portraitsById.has(normalizeRequiredText(portraitId, "Character portrait ID"));
  }

  /** 按 ID 返回一个立绘定义副本；没有对应立绘时返回 undefined。 */
  public getPortrait(portraitId: string): CharacterPortraitDefinition | undefined {
    const portrait = this.portraitsById.get(normalizeRequiredText(portraitId, "Character portrait ID"));
    return portrait === undefined ? undefined : clonePortrait(portrait);
  }

  /** 修改当前显示名，不会改变角色的默认名称或场景局部显示名覆盖。 */
  public setDisplayName(displayName: string): void {
    this.currentDisplayName = normalizeRequiredText(displayName, "Character displayName");
  }

  /**
   * 选择一个已声明立绘；传入 null 会清除当前选择。
   *
   * 资源是否已加载由资源层决定。这里仅保证角色不会进入引用未知立绘的状态。
   */
  public setPortrait(portraitId: CharacterPortraitId | null): void {
    this.currentPortraitId = normalizeCurrentPortraitId(portraitId, this.portraitsById);
  }

  /** 返回独立的运行时状态快照，供回退、存档协调器或场景切换使用。 */
  public snapshot(): CharacterState {
    return {
      displayName: this.currentDisplayName,
      portraitId: this.currentPortraitId,
    };
  }

  /**
   * 恢复此前保存的运行时状态。
   *
   * 整个快照会先验证完成再写入，避免无效数据造成显示名已经改变但立绘恢复失败
   * 的半更新状态。
   */
  public restore(state: CharacterState): void {
    const normalizedState = normalizeState(state, this.portraitsById);
    this.currentDisplayName = normalizedState.displayName;
    this.currentPortraitId = normalizedState.portraitId;
  }

  /** 将可变角色状态还原为创建时的默认显示名和默认立绘。 */
  public resetState(): void {
    this.currentDisplayName = this.name;
    this.currentPortraitId = this.initialPortraitId;
  }

  /**
   * 导出可用于重新创建角色的初始配置。
   *
   * 当前 displayName 和 portraitId 属于会话状态，应通过 snapshot() 单独保存，
   * 因而不会混入这里的定义数据。
   */
  public toDefinition(): CharacterDefinition {
    return {
      id: this.id,
      name: this.name,
      aliases: [...this.aliases],
      tags: [...this.tags],
      ...(this.portraitDefinitions.length === 0 ? {} : { portraits: this.portraits }),
      ...(this.initialPortraitId === null ? {} : { defaultPortraitId: this.initialPortraitId }),
    };
  }
}

function normalizeRequiredText(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${fieldName} must be a string`);
  }

  const normalizedValue = value.trim();
  if (normalizedValue.length === 0) {
    throw new Error(`${fieldName} cannot be empty`);
  }

  return normalizedValue;
}

function normalizeTextList(values: unknown, fieldName: string): string[] {
  if (!Array.isArray(values)) {
    throw new TypeError(`${fieldName} must be an array`);
  }

  const uniqueValues = new Set<string>();
  for (const value of values) {
    uniqueValues.add(normalizeRequiredText(value, fieldName));
  }
  return [...uniqueValues];
}

function normalizePortraits(value: unknown): CharacterPortraitDefinition[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new TypeError("Character portraits must be an array");
  }

  const portraitIds = new Set<CharacterPortraitId>();
  return value.map((portrait, index) => {
    const path = `Character portraits[${index}]`;
    if (portrait === null || typeof portrait !== "object" || Array.isArray(portrait)) {
      throw new TypeError(`${path} must be an object`);
    }

    const record = portrait as Record<string, unknown>;
    const id = normalizeRequiredText(record.id, `${path}.id`);
    if (portraitIds.has(id)) {
      throw new TypeError(`Character portraits contain duplicate ID '${id}'`);
    }
    portraitIds.add(id);

    return {
      id,
      asset: normalizeRequiredText(record.asset, `${path}.asset`),
    };
  });
}

function normalizeInitialPortraitId(
  value: unknown,
  portraitsById: ReadonlyMap<CharacterPortraitId, CharacterPortraitDefinition>,
): CharacterPortraitId | null {
  if (value === undefined) {
    return null;
  }

  const portraitId = normalizeRequiredText(value, "Character defaultPortraitId");
  if (!portraitsById.has(portraitId)) {
    throw new RangeError(`Character defaultPortraitId '${portraitId}' is not declared`);
  }
  return portraitId;
}

function normalizeCurrentPortraitId(
  value: unknown,
  portraitsById: ReadonlyMap<CharacterPortraitId, CharacterPortraitDefinition>,
): CharacterPortraitId | null {
  if (value === null) {
    return null;
  }

  const portraitId = normalizeRequiredText(value, "Character portrait ID");
  if (!portraitsById.has(portraitId)) {
    throw new RangeError(`Character portrait '${portraitId}' is not declared`);
  }
  return portraitId;
}

function normalizeState(
  value: unknown,
  portraitsById: ReadonlyMap<CharacterPortraitId, CharacterPortraitDefinition>,
): CharacterState {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Character state must be an object");
  }

  const record = value as Record<string, unknown>;
  return {
    displayName: normalizeRequiredText(record.displayName, "Character state.displayName"),
    portraitId: normalizeCurrentPortraitId(record.portraitId, portraitsById),
  };
}

function freezePortraits(portraits: readonly CharacterPortraitDefinition[]): readonly CharacterPortraitDefinition[] {
  return Object.freeze(portraits.map((portrait) => Object.freeze(clonePortrait(portrait))));
}

function clonePortrait(portrait: CharacterPortraitDefinition): CharacterPortraitDefinition {
  return { id: portrait.id, asset: portrait.asset };
}
