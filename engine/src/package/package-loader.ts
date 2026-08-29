import { createHash } from "node:crypto";
import { CharacterRegistry, requireCharacterId } from "../character";
import { Scene, requireSceneId } from "../scene";
import { FileSystemError, type ReadonlyFileSystem } from "../filesystem";
import { lua, lauxlib, to_luastring } from "fengari";
import { readLuaError } from "../lua/errors/lua-error";
import { validateVariableDefinition, type VariableDefinition } from "../variables";
import { AssetRegistry, requireAssetId } from "./asset-registry";
import { LoadedRuntimePackage } from "./loaded-runtime-package";
import { PackageLoadError } from "./package-load-error";
import { RouteTable } from "./route-table";
import {
  RUNTIME_PACKAGE_FORMAT_VERSION,
  type PackageEngineDefinition,
  type PackageMetadataDefinition,
  type RuntimePackage,
} from "./runtime-package";
import { SceneRegistry } from "./scene-registry";

const MANIFEST_PATH = "manifest.json";
const PACKAGE_ID_PATTERN = /^[a-z][a-z0-9_.-]*$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export interface PackageLoaderOptions {
  /** Current engine version used for the optional manifest engine.minVersion check. */
  readonly engineVersion?: string;
}

/** Reads and validates a Runtime Package v1 from a synchronous file source. */
export class PackageLoader {
  private readonly engineVersion: string;

  public constructor(
    private readonly files: ReadonlyFileSystem,
    options: PackageLoaderOptions = {},
  ) {
    this.engineVersion = options.engineVersion ?? "0.1.0";
    if (!SEMVER_PATTERN.test(this.engineVersion)) {
      throw new TypeError("engineVersion must be a semantic version");
    }
  }

  /** Load a complete package without executing any scene code. */
  public load(): LoadedRuntimePackage {
    const manifest = this.readManifest();
    const definition = this.normalizeManifest(manifest);

    const assets = this.buildAssets(definition.assets);
    const characters = this.buildCharacters(definition.characters);
    const scenes = this.buildScenes(definition.scenes);
    const routes = this.buildRoutes(definition.routes);

    this.validateAssetFiles(assets);
    this.validateMetadata(definition.metadata, assets);
    this.validateCharacterAssets(characters, assets);
    this.validateScenes(scenes, characters, routes);
    this.validateEntryScene(definition.entryScene, scenes);

    return new LoadedRuntimePackage(
      {
        ...definition,
        assets: assets.toDefinitions(),
        characters: characters.toDefinitions(),
        variables: definition.variables,
        scenes: scenes.toDefinitions(),
        routes: routes.toDefinition(),
      },
      this.files,
      assets,
      scenes,
      routes,
    );
  }

  private readManifest(): unknown {
    let text: string;
    try {
      text = this.files.readText(MANIFEST_PATH);
    } catch (error) {
      const code = error instanceof FileSystemError && error.code === "INVALID_TEXT"
        ? "INVALID_MANIFEST"
        : "FILE_NOT_FOUND";
      throw packageError(code, MANIFEST_PATH, "manifest.json could not be read as UTF-8", error);
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      throw packageError("INVALID_MANIFEST", MANIFEST_PATH, "must contain valid JSON", error);
    }
  }

  private normalizeManifest(value: unknown): RuntimePackage {
    const manifest = requireRecord(value, MANIFEST_PATH);
    assertAllowedKeys(manifest, [
      "formatVersion",
      "packageId",
      "packageVersion",
      "saveSchemaVersion",
      "entryScene",
      "engine",
      "metadata",
      "assets",
      "characters",
      "variables",
      "scenes",
      "routes",
    ], MANIFEST_PATH);

    const formatVersion = manifest.formatVersion;
    if (typeof formatVersion !== "number" || !Number.isSafeInteger(formatVersion) || formatVersion < 0) {
      throw packageError("INVALID_MANIFEST", "formatVersion", "must be a non-negative safe integer");
    }
    if (formatVersion !== RUNTIME_PACKAGE_FORMAT_VERSION) {
      throw packageError(
        "UNSUPPORTED_FORMAT",
        "formatVersion",
        `must be ${RUNTIME_PACKAGE_FORMAT_VERSION}`,
      );
    }

    const packageId = requireIdentifier(manifest.packageId, "packageId");
    const packageVersion = requireSemver(manifest.packageVersion, "packageVersion");
    const saveSchemaVersion = requireNonNegativeSafeInteger(manifest.saveSchemaVersion, "saveSchemaVersion");
    const entryScene = requireSceneIdWithError(manifest.entryScene, "entryScene");
    const engine = normalizeEngine(manifest.engine);
    this.validateEngine(engine);
    const metadata = normalizeMetadata(manifest.metadata);

    const assets = requireArray(manifest.assets, "assets");
    const characters = requireArray(manifest.characters, "characters");
    const variables = normalizeVariables(requireArray(manifest.variables, "variables"));
    const scenes = requireArray(manifest.scenes, "scenes");
    const routes = requireRecord(manifest.routes, "routes");

    return {
      formatVersion,
      packageId,
      packageVersion,
      saveSchemaVersion,
      entryScene,
      ...(engine === undefined ? {} : { engine }),
      ...(metadata === undefined ? {} : { metadata }),
      assets: assets as RuntimePackage["assets"],
      characters: characters as RuntimePackage["characters"],
      variables,
      scenes: scenes as RuntimePackage["scenes"],
      routes: routes as RuntimePackage["routes"],
    };
  }

  private validateEngine(engine: PackageEngineDefinition | undefined): void {
    if (engine?.minVersion !== undefined && compareVersions(this.engineVersion, engine.minVersion) < 0) {
      throw packageError(
        "INCOMPATIBLE_ENGINE",
        "engine.minVersion",
        `requires engine ${engine.minVersion} but current engine is ${this.engineVersion}`,
      );
    }
  }

  private buildAssets(definitions: RuntimePackage["assets"]): AssetRegistry {
    try {
      return new AssetRegistry(definitions);
    } catch (error) {
      throw packageError("INVALID_MANIFEST", findDefinitionPath("assets", definitions, error), messageOf(error), error);
    }
  }

  private buildCharacters(definitions: RuntimePackage["characters"]): CharacterRegistry {
    try {
      return new CharacterRegistry(definitions);
    } catch (error) {
      throw packageError("INVALID_MANIFEST", findDefinitionPath("characters", definitions, error), messageOf(error), error);
    }
  }

  private buildScenes(definitions: RuntimePackage["scenes"]): SceneRegistry {
    const scenes: Scene[] = [];
    for (const [index, definition] of definitions.entries()) {
      try {
        scenes.push(new Scene(definition));
      } catch (error) {
        throw packageError("INVALID_MANIFEST", `scenes[${index}]`, messageOf(error), error);
      }
    }
    try {
      return new SceneRegistry(scenes);
    } catch (error) {
      throw packageError("INVALID_MANIFEST", "scenes", messageOf(error), error);
    }
  }

  private buildRoutes(definition: RuntimePackage["routes"]): RouteTable {
    try {
      return new RouteTable(definition);
    } catch (error) {
      throw packageError("INVALID_MANIFEST", "routes", messageOf(error), error);
    }
  }

  private validateAssetFiles(assets: AssetRegistry): void {
    for (const [index, asset] of assets.all().entries()) {
      const manifestPath = `assets[${index}].path`;
      let exists: boolean;
      try {
        exists = this.files.hasFile(asset.path);
      } catch (error) {
        throw packageError("FILE_NOT_FOUND", manifestPath, `file '${asset.path}' could not be inspected`, error);
      }
      if (!exists) {
        throw packageError("FILE_NOT_FOUND", manifestPath, `file '${asset.path}' does not exist`);
      }
      if (asset.integrity !== undefined) {
        this.validateAssetIntegrity(asset.path, asset.integrity.digest, `assets[${index}].integrity.digest`);
      }
    }
  }

  private validateAssetIntegrity(assetPath: string, expectedDigest: string, manifestPath: string): void {
    let bytes: Uint8Array;
    try {
      bytes = this.files.readFile(assetPath);
    } catch (error) {
      throw packageError("FILE_NOT_FOUND", manifestPath, `file '${assetPath}' could not be read`, error);
    }
    const actualDigest = createHash("sha256").update(bytes).digest("hex");
    if (actualDigest !== expectedDigest) {
      throw packageError(
        "INTEGRITY_MISMATCH",
        manifestPath,
        `expected SHA-256 '${expectedDigest}' but found '${actualDigest}'`,
      );
    }
  }

  private validateMetadata(metadata: PackageMetadataDefinition | undefined, assets: AssetRegistry): void {
    if (metadata?.cover !== undefined && !assets.has(metadata.cover)) {
      throw packageError("INVALID_REFERENCE", "metadata.cover", `references unknown asset '${metadata.cover}'`);
    }
  }

  private validateCharacterAssets(characters: CharacterRegistry, assets: AssetRegistry): void {
    for (const [characterIndex, character] of characters.toDefinitions().entries()) {
      for (const [portraitIndex, portrait] of (character.portraits ?? []).entries()) {
        try {
          requireAssetId(portrait.asset, `characters[${characterIndex}].portraits[${portraitIndex}].asset`);
        } catch (error) {
          throw packageError("INVALID_REFERENCE", `characters[${characterIndex}].portraits[${portraitIndex}].asset`, messageOf(error), error);
        }
        const portraitAssetPath = `characters[${characterIndex}].portraits[${portraitIndex}].asset`;
        if (!assets.has(portrait.asset)) {
          throw packageError(
            "INVALID_REFERENCE",
            portraitAssetPath,
            `references unknown asset '${portrait.asset}'`,
          );
        }
        if (assets.require(portrait.asset).kind !== "image") {
          throw packageError(
            "INVALID_REFERENCE",
            portraitAssetPath,
            `must reference an image asset, but '${portrait.asset}' is ${assets.require(portrait.asset).kind}`,
          );
        }
      }
    }
  }

  private validateScenes(scenes: SceneRegistry, characters: CharacterRegistry, routes: RouteTable): void {
    // 先验证路由端点，确保一个明显的未知源/目标不会被其他场景的出口覆盖错误遮蔽。
    for (const route of routes.entries()) {
      if (!scenes.has(route.sourceSceneId)) {
        throw packageError("INVALID_REFERENCE", `routes.${route.sourceSceneId}`, "references an unknown source scene");
      }
      if (!scenes.has(route.targetSceneId)) {
        throw packageError(
          "INVALID_REFERENCE",
          `routes.${route.sourceSceneId}.${route.port}`,
          `references unknown target scene '${route.targetSceneId}'`,
        );
      }
    }

    const scriptPaths = new Set<string>();
    for (const [index, scene] of scenes.all().entries()) {
      const scenePath = `scenes[${index}]`;
      const scriptPath = scene.mainScriptPath.value;
      if (!scriptPath.startsWith("scenes/")) {
        throw packageError("INVALID_MANIFEST", `${scenePath}.mainScript`, "must be stored under the scenes/ directory");
      }
      const sceneDirectory = scene.mainScriptPath.parent();
      if (sceneDirectory === null || sceneDirectory.value === "scenes") {
        throw packageError("INVALID_MANIFEST", `${scenePath}.mainScript`, "must be stored inside a Scene directory");
      }
      if (scriptPaths.has(scriptPath)) {
        throw packageError("INVALID_MANIFEST", `${scenePath}.mainScript`, `duplicates scene script '${scriptPath}'`);
      }
      scriptPaths.add(scriptPath);

      for (const [castIndex, characterId] of scene.getCharacterIds().entries()) {
        try {
          requireCharacterId(characterId, `${scenePath}.cast[${castIndex}].characterId`);
        } catch (error) {
          throw packageError("INVALID_REFERENCE", `${scenePath}.cast[${castIndex}].characterId`, messageOf(error), error);
        }
        if (!characters.has(characterId)) {
          throw packageError(
            "INVALID_REFERENCE",
            `${scenePath}.cast[${castIndex}].characterId`,
            `references unknown character '${characterId}'`,
          );
        }
      }

      const declaredExits = new Set(scene.exits);
      for (const exit of declaredExits) {
        if (!routes.has(scene.id, exit)) {
          throw packageError("INVALID_REFERENCE", `routes.${scene.id}.${exit}`, "is missing for declared scene exit");
        }
      }
      for (const port of routes.getPorts(scene.id)) {
        if (!declaredExits.has(port)) {
          throw packageError("INVALID_REFERENCE", `routes.${scene.id}.${port}`, "does not match a declared scene exit");
        }
      }

      this.validateScript(`${scenePath}.mainScript`, scriptPath);
    }
  }

  private validateScript(manifestPath: string, scriptPath: string): void {
    let source: string;
    try {
      source = this.files.readText(scriptPath);
    } catch (error) {
      const code = error instanceof FileSystemError && error.code === "INVALID_TEXT"
        ? "INVALID_SCRIPT"
        : "FILE_NOT_FOUND";
      throw packageError(code, manifestPath, `file '${scriptPath}' could not be read as UTF-8`, error);
    }

    const state = lauxlib.luaL_newstate();
    try {
      const bytes = to_luastring(source);
      const status = lauxlib.luaL_loadbuffer(state, bytes, bytes.length, to_luastring(scriptPath));
      if (status !== lua.LUA_OK) {
        throw readLuaError(state, scriptPath, status);
      }
    } catch (error) {
      throw packageError("INVALID_SCRIPT", manifestPath, messageOf(error), error);
    } finally {
      lua.lua_close(state);
    }
  }

  private validateEntryScene(entryScene: string, scenes: SceneRegistry): void {
    if (!scenes.has(entryScene)) {
      throw packageError("INVALID_REFERENCE", "entryScene", `references unknown scene '${entryScene}'`);
    }
  }
}

function normalizeVariables(values: unknown[]): readonly VariableDefinition[] {
  const keys = new Set<string>();
  return values.map((value, index) => {
    const path = `variables[${index}]`;
    try {
      validateVariableDefinition(value as VariableDefinition, path);
    } catch (error) {
      throw packageError("INVALID_MANIFEST", path, messageOf(error), error);
    }
    const definition = value as VariableDefinition;
    if (keys.has(definition.key)) {
      throw packageError("INVALID_MANIFEST", `${path}.key`, `duplicate variable key '${definition.key}'`);
    }
    keys.add(definition.key);
    return definition;
  });
}

function normalizeEngine(value: unknown): PackageEngineDefinition | undefined {
  if (value === undefined) {
    return undefined;
  }
  const engine = requireRecord(value, "engine");
  assertAllowedKeys(engine, ["minVersion"], "engine");
  if (engine.minVersion !== undefined && (typeof engine.minVersion !== "string" || !SEMVER_PATTERN.test(engine.minVersion))) {
    throw packageError("INVALID_MANIFEST", "engine.minVersion", "must be a semantic version");
  }
  return engine.minVersion === undefined ? {} : { minVersion: engine.minVersion };
}

function normalizeMetadata(value: unknown): PackageMetadataDefinition | undefined {
  if (value === undefined) {
    return undefined;
  }
  const metadata = requireRecord(value, "metadata");
  assertAllowedKeys(metadata, ["title", "author", "language", "cover"], "metadata");
  for (const key of ["title", "author", "language"] as const) {
    if (metadata[key] !== undefined) {
      requireNonEmptyText(metadata[key], `metadata.${key}`);
    }
  }
  if (metadata.cover !== undefined) {
    try {
      requireAssetId(metadata.cover, "metadata.cover");
    } catch (error) {
      throw packageError("INVALID_MANIFEST", "metadata.cover", messageOf(error), error);
    }
  }
  return {
    ...(metadata.title === undefined ? {} : { title: metadata.title as string }),
    ...(metadata.author === undefined ? {} : { author: metadata.author as string }),
    ...(metadata.language === undefined ? {} : { language: metadata.language as string }),
    ...(metadata.cover === undefined ? {} : { cover: metadata.cover as string }),
  };
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw packageError("INVALID_MANIFEST", path, "must be an object");
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw packageError("INVALID_MANIFEST", path, "must not contain symbol keys");
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (!Object.prototype.propertyIsEnumerable.call(value, key)) {
      throw packageError("INVALID_MANIFEST", path, "must not contain non-enumerable keys");
    }
  }
  return value as Record<string, unknown>;
}

function assertAllowedKeys(record: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      throw packageError("INVALID_MANIFEST", path, `contains unknown field '${key}'`);
    }
  }
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw packageError("INVALID_MANIFEST", path, "must be an array");
  }
  return value;
}

function requireIdentifier(value: unknown, path: string): string {
  if (typeof value !== "string" || !PACKAGE_ID_PATTERN.test(value)) {
    throw packageError("INVALID_MANIFEST", path, `must match ${PACKAGE_ID_PATTERN.source}`);
  }
  return value;
}

function requireNonEmptyText(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim() !== value) {
    throw packageError("INVALID_MANIFEST", path, "must be non-empty text without surrounding whitespace");
  }
  return value;
}

function requireSemver(value: unknown, path: string): string {
  const version = requireNonEmptyText(value, path);
  if (!SEMVER_PATTERN.test(version)) {
    throw packageError("INVALID_MANIFEST", path, "must be a semantic version");
  }
  return version;
}

function requireNonNegativeSafeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw packageError("INVALID_MANIFEST", path, "must be a non-negative safe integer");
  }
  return value;
}

function requireSceneIdWithError(value: unknown, path: string): string {
  try {
    return requireSceneId(value, path);
  } catch (error) {
    throw packageError("INVALID_MANIFEST", path, messageOf(error), error);
  }
}

function findDefinitionPath(prefix: string, definitions: readonly unknown[], error: unknown): string {
  const match = /\[(\d+)\]/.exec(messageOf(error));
  return match === null ? prefix : `${prefix}[${match[1]}]`;
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(/[+-]/, 1)[0].split(".").map(Number);
  const rightParts = right.split(/[+-]/, 1)[0].split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] < rightParts[index] ? -1 : 1;
    }
  }
  return 0;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function packageError(
  code: ConstructorParameters<typeof PackageLoadError>[0],
  path: string,
  message: string,
  cause?: unknown,
): PackageLoadError {
  return new PackageLoadError(code, path, message, cause);
}
