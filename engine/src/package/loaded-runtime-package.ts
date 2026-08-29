import type { CharacterDefinition } from "../character";
import { CharacterRegistry } from "../character";
import { VirtualPath, type ReadonlyFileSystem } from "../filesystem";
import type { VariableDefinition } from "../variables";
import { AssetRegistry } from "./asset-registry";
import { RouteTable } from "./route-table";
import type { RuntimePackage, PackageMetadataDefinition, PackageEngineDefinition } from "./runtime-package";
import { SceneRegistry } from "./scene-registry";

/**
 * Immutable, validated package data shared by game sessions.
 *
 * The registries contain only static definitions. In particular, character
 * instances are deliberately created on demand for each session.
 */
export class LoadedRuntimePackage {
  public readonly files: ReadonlyFileSystem;
  public readonly assets: AssetRegistry;
  public readonly scenes: SceneRegistry;
  public readonly routes: RouteTable;
  public readonly entryScene: string;

  private readonly packageDefinition: RuntimePackage;
  private readonly characterDefinitions: readonly CharacterDefinition[];
  private readonly variableDefinitions: readonly VariableDefinition[];

  public constructor(
    definition: RuntimePackage,
    files: ReadonlyFileSystem,
    assets: AssetRegistry,
    scenes: SceneRegistry,
    routes: RouteTable,
  ) {
    this.packageDefinition = freezeValue(cloneValue(definition)) as RuntimePackage;
    this.files = files;
    this.assets = assets;
    this.scenes = scenes;
    this.routes = routes;
    this.entryScene = this.packageDefinition.entryScene;
    this.characterDefinitions = this.packageDefinition.characters;
    this.variableDefinitions = this.packageDefinition.variables;
  }

  public get formatVersion(): number {
    return this.packageDefinition.formatVersion;
  }

  public get packageId(): string {
    return this.packageDefinition.packageId;
  }

  public get packageVersion(): string {
    return this.packageDefinition.packageVersion;
  }

  public get saveSchemaVersion(): number {
    return this.packageDefinition.saveSchemaVersion;
  }

  public get engine(): PackageEngineDefinition | undefined {
    return cloneValue(this.packageDefinition.engine);
  }

  public get metadata(): PackageMetadataDefinition | undefined {
    return cloneValue(this.packageDefinition.metadata);
  }

  public get characters(): readonly CharacterDefinition[] {
    return cloneValue(this.characterDefinitions);
  }

  public get variables(): readonly VariableDefinition[] {
    return cloneValue(this.variableDefinitions);
  }

  /** Read a validated scene's UTF-8 main.lua source without exposing host paths. */
  public readSceneScript(sceneId: string): string {
    const scene = this.scenes.require(sceneId);
    return this.files.readText(VirtualPath.from(scene.mainScriptPath));
  }

  /** Return a fresh mutable character registry owned by one game session. */
  public createCharacterRegistry(): CharacterRegistry {
    return new CharacterRegistry(this.characters);
  }

  /** Return a fresh, detached manifest definition. */
  public toDefinition(): RuntimePackage {
    return cloneValue(this.packageDefinition);
  }

  public get manifest(): RuntimePackage {
    return this.toDefinition();
  }
}

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T;
  }
  const clone: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    Object.defineProperty(clone, key, {
      configurable: true,
      enumerable: true,
      value: cloneValue(item),
      writable: true,
    });
  }
  return clone as T;
}

function freezeValue<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Array.isArray(value) ? value : Object.values(value as object)) {
      freezeValue(child);
    }
    Object.freeze(value);
  }
  return value;
}
