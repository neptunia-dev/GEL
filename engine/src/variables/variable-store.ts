import {
  cloneVariableDefinition,
  cloneVariableValue,
  type VariableDefinition,
  type VariableValue,
  validateVariableDefinition,
  validateVariableValue,
} from "./variable-schema";

export type VariableSnapshot = Readonly<Record<string, VariableValue>>;

/** Validated values for all predeclared game variables. */
export class VariableStore {
  private readonly definitionMap = new Map<string, VariableDefinition>();
  private readonly definitionList: readonly VariableDefinition[];
  private readonly values = new Map<string, VariableValue>();

  public constructor(definitions: readonly VariableDefinition[]) {
    if (!Array.isArray(definitions)) {
      throw new TypeError("variables must be an array");
    }
    const storedDefinitions: VariableDefinition[] = [];
    for (const definition of definitions) {
      validateVariableDefinition(definition);
      if (this.definitionMap.has(definition.key)) {
        throw new TypeError(`Duplicate variable key '${definition.key}'`);
      }
      const copy = cloneVariableDefinition(definition);
      this.definitionMap.set(copy.key, copy);
      storedDefinitions.push(copy);
      this.values.set(copy.key, cloneVariableValue(copy.defaultValue));
    }
    this.definitionList = storedDefinitions;
  }

  public get definitions(): readonly VariableDefinition[] {
    return this.definitionList.map((definition) => cloneVariableDefinition(definition));
  }

  public getDefinition(key: string): VariableDefinition | undefined {
    const definition = this.definitionMap.get(key);
    return definition === undefined ? undefined : cloneVariableDefinition(definition);
  }

  public has(key: string): boolean {
    this.requireDefinition(key);
    return true;
  }

  public get(key: string): VariableValue {
    this.requireDefinition(key);
    return cloneVariableValue(this.values.get(key) as VariableValue);
  }

  public set(key: string, value: VariableValue): void {
    const definition = this.requireDefinition(key);
    this.ensureWritable(definition);
    validateVariableValue(value, definition.schema, `variable '${key}'`);
    this.values.set(key, cloneVariableValue(value));
  }

  public add(key: string, amount: number): number {
    const definition = this.requireDefinition(key);
    this.ensureWritable(definition);
    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      throw new TypeError("amount must be a finite number");
    }
    const current = this.values.get(key);
    if (typeof current !== "number") {
      throw new TypeError(`variable '${key}' is not a number`);
    }
    const next = current + amount;
    validateVariableValue(next, definition.schema, `variable '${key}'`);
    this.values.set(key, next);
    return next;
  }

  public reset(key: string): void {
    const definition = this.requireDefinition(key);
    this.ensureWritable(definition);
    this.values.set(key, cloneVariableValue(definition.defaultValue));
  }

  public snapshot(): Record<string, VariableValue> {
    const snapshot: Record<string, VariableValue> = {};
    for (const [key, value] of this.values) {
      snapshot[key] = cloneVariableValue(value);
    }
    return snapshot;
  }

  public restore(snapshot: VariableSnapshot): void {
    if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      throw new TypeError("snapshot must be an object");
    }
    if (Object.getOwnPropertySymbols(snapshot).length > 0) {
      throw new TypeError("snapshot must not contain symbol keys");
    }

    const snapshotKeys = Object.keys(snapshot);
    for (const key of snapshotKeys) {
      this.requireDefinition(key);
    }
    for (const key of this.definitionMap.keys()) {
      if (!Object.prototype.hasOwnProperty.call(snapshot, key)) {
        throw new TypeError(`snapshot is missing variable '${key}'`);
      }
    }

    const restored = new Map<string, VariableValue>();
    for (const [key, definition] of this.definitionMap) {
      const value = snapshot[key];
      validateVariableValue(value, definition.schema, `variable '${key}'`);
      restored.set(key, cloneVariableValue(value));
    }
    for (const [key, value] of restored) {
      this.values.set(key, value);
    }
  }

  private requireDefinition(key: string): VariableDefinition {
    const definition = this.definitionMap.get(key);
    if (definition === undefined) {
      throw new TypeError(`Unknown variable '${key}'`);
    }
    return definition;
  }

  private ensureWritable(definition: VariableDefinition): void {
    if (definition.readonly === true) {
      throw new TypeError(`Variable '${definition.key}' is readonly`);
    }
  }
}
