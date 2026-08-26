import { VariableStore, type VariableSnapshot } from "./variable-store";
import type { VariableDefinition } from "./variable-schema";

export interface GameStateOptions {
  readonly packageId: string;
  readonly schemaVersion: number;
  readonly sceneId: string;
  readonly variables: readonly VariableDefinition[];
}

/** Mutable game-level state shared by scene runs and save operations. */
export class GameState {
  public readonly packageId: string;
  public readonly schemaVersion: number;
  public readonly variables: VariableStore;
  private currentSceneId: string;

  public constructor(options: GameStateOptions) {
    validateStateIdentifier(options.packageId, "packageId");
    validateSchemaVersion(options.schemaVersion);
    validateStateIdentifier(options.sceneId, "sceneId");
    this.packageId = options.packageId;
    this.schemaVersion = options.schemaVersion;
    this.currentSceneId = options.sceneId;
    this.variables = new VariableStore(options.variables);
  }

  public get sceneId(): string {
    return this.currentSceneId;
  }

  public set sceneId(value: string) {
    validateStateIdentifier(value, "sceneId");
    this.currentSceneId = value;
  }

  public snapshot(): VariableSnapshot {
    return this.variables.snapshot();
  }

  public restore(snapshot: VariableSnapshot): void {
    this.variables.restore(snapshot);
  }
}

function validateStateIdentifier(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new TypeError(`${name} must be a non-empty identifier`);
  }
}

function validateSchemaVersion(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("schemaVersion must be a non-negative safe integer");
  }
}
