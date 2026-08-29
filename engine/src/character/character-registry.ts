import {
  Character,
  type CharacterDefinition,
  type CharacterId,
  type CharacterState,
  requireCharacterId,
} from "./character";

/** 以角色 ID 为键的完整角色运行时状态快照。 */
export type CharacterStateSnapshot = Readonly<Record<CharacterId, CharacterState>>;

/**
 * 一个游戏会话拥有的角色实例集合。
 *
 * 注册表从定义创建独立的 Character 实例；不同会话之间不能共享实例，避免
 * 一个存档或剧情分支改变另一个会话的显示名、立绘或其他角色状态。
 */
export class CharacterRegistry {
  private readonly definitionsById = new Map<CharacterId, CharacterDefinition>();
  private readonly charactersById = new Map<CharacterId, Character>();

  public constructor(definitions: readonly CharacterDefinition[]) {
    if (!Array.isArray(definitions)) {
      throw new TypeError("characters must be an array");
    }

    for (const [index, definition] of definitions.entries()) {
      const character = createCharacter(definition, `characters[${index}]`);
      if (this.charactersById.has(character.id)) {
        throw new TypeError(`Duplicate character ID '${character.id}'`);
      }
      this.charactersById.set(character.id, character);
      this.definitionsById.set(character.id, character.toDefinition());
    }
  }

  /** 按稳定 ID 返回当前会话中的可变角色实例。 */
  public get(id: CharacterId): Character | undefined {
    return this.charactersById.get(requireCharacterId(id));
  }

  /** 判断角色 ID 是否已注册。 */
  public has(id: CharacterId): boolean {
    return this.get(id) !== undefined;
  }

  /** 按稳定 ID 要求一个角色存在。 */
  public require(id: CharacterId): Character {
    const character = this.get(id);
    if (character === undefined) {
      throw new RangeError(`Unknown character '${id}'`);
    }
    return character;
  }

  /**
   * 按 ID、默认名称、当前显示名或别名查找角色。
   *
   * 如果多个角色匹配同一个名称或别名，直接报错而不是随机选择一个实例。
   */
  public find(value: string): Character | undefined {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new TypeError("Character lookup value must be a non-empty string");
    }

    let match: Character | undefined;
    for (const character of this.charactersById.values()) {
      if (!character.matches(value)) {
        continue;
      }
      if (match !== undefined && match.id !== character.id) {
        throw new RangeError(`Character lookup value '${value.trim()}' is ambiguous`);
      }
      match = character;
    }
    return match;
  }

  /** 返回当前会话中的角色实例；实例本身是有意可变的运行时对象。 */
  public all(): readonly Character[] {
    return [...this.charactersById.values()];
  }

  /** 返回角色定义的独立副本，不暴露注册表内部对象。 */
  public get definitions(): readonly CharacterDefinition[] {
    return [...this.definitionsById.values()].map(cloneDefinition);
  }

  /** 返回所有角色的完整运行时状态快照。 */
  public snapshot(): CharacterStateSnapshot {
    const snapshot: Record<string, CharacterState> = {};
    for (const [id, character] of this.charactersById) {
      const state = character.snapshot();
      Object.defineProperty(snapshot, id, {
        configurable: true,
        enumerable: true,
        value: { displayName: state.displayName, portraitId: state.portraitId },
        writable: true,
      });
    }
    return snapshot;
  }

  /**
   * 原子恢复全部角色状态。
   *
   * 恢复前先验证完整快照中的所有角色和立绘引用，任何错误都会使当前注册表
   * 保持不变。
   */
  public restore(snapshot: CharacterStateSnapshot): void {
    const normalized = normalizeSnapshot(snapshot, this.charactersById);
    for (const [id, state] of normalized) {
      this.charactersById.get(id)?.restore(state);
    }
  }

  /** 将所有角色恢复到各自定义中的默认状态。 */
  public reset(): void {
    for (const character of this.charactersById.values()) {
      character.resetState();
    }
  }

  /** 导出定义副本；与 definitions getter 等价，便于包层调用。 */
  public toDefinitions(): readonly CharacterDefinition[] {
    return this.definitions;
  }
}

function createCharacter(value: unknown, path: string): Character {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  try {
    return new Character(value as CharacterDefinition);
  } catch (error) {
    throw withPath(error, path);
  }
}

function normalizeSnapshot(
  value: unknown,
  charactersById: ReadonlyMap<CharacterId, Character>,
): Map<CharacterId, CharacterState> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("character state snapshot must be an object");
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError("character state snapshot must not contain symbol keys");
  }

  const record = value as Record<string, unknown>;
  for (const id of Object.keys(record)) {
    if (!charactersById.has(id)) {
      throw new TypeError(`character state snapshot contains unknown character '${id}'`);
    }
  }

  const normalized = new Map<CharacterId, CharacterState>();
  for (const [id, character] of charactersById) {
    if (!Object.prototype.hasOwnProperty.call(record, id)) {
      throw new TypeError(`character state snapshot is missing character '${id}'`);
    }
    const state = record[id];
    if (state === null || typeof state !== "object" || Array.isArray(state)) {
      throw new TypeError(`character state '${id}' must be an object`);
    }
    const stateRecord = state as Record<string, unknown>;
    if (typeof stateRecord.displayName !== "string" || stateRecord.displayName.trim().length === 0) {
      throw new TypeError(`character state '${id}'.displayName must be non-empty text`);
    }
    const portraitId = stateRecord.portraitId;
    if (portraitId !== null && (typeof portraitId !== "string" || portraitId.trim().length === 0)) {
      throw new TypeError(`character state '${id}'.portraitId must be null or non-empty text`);
    }
    const normalizedPortraitId = portraitId === null ? null : portraitId.trim();
    if (normalizedPortraitId !== null && !character.hasPortrait(normalizedPortraitId)) {
      throw new RangeError(`character state '${id}' references unknown portrait '${normalizedPortraitId}'`);
    }
    normalized.set(id, {
      displayName: stateRecord.displayName.trim(),
      portraitId: normalizedPortraitId,
    });
  }
  return normalized;
}

function cloneDefinition(definition: CharacterDefinition): CharacterDefinition {
  const character = new Character(definition);
  return character.toDefinition();
}

function withPath(error: unknown, path: string): Error {
  if (error instanceof TypeError) {
    return new TypeError(`${path}: ${error.message}`);
  }
  if (error instanceof RangeError) {
    return new RangeError(`${path}: ${error.message}`);
  }
  if (error instanceof Error) {
    return new Error(`${path}: ${error.message}`);
  }
  return new Error(`${path}: ${String(error)}`);
}
