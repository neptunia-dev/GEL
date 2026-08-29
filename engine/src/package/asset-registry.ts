import { VirtualPath } from "../filesystem";
import {
  type AssetDefinition,
  type AssetId,
  type AssetIntegrityDefinition,
  type AssetKind,
} from "./runtime-package";

/** 资源 ID 的稳定 ASCII 格式。 */
export const ASSET_ID_PATTERN = /^[a-z][a-z0-9_.-]*$/;

/** 验证并返回资源 ID。 */
export function requireAssetId(value: unknown, name = "Asset ID"): AssetId {
  if (typeof value !== "string" || !ASSET_ID_PATTERN.test(value)) {
    throw new TypeError(`${name} must match ${ASSET_ID_PATTERN.source}`);
  }
  return value;
}

const ASSET_KINDS: readonly AssetKind[] = ["image", "audio", "video", "font", "data"];

/**
 * 已验证、不可变的资源目录。
 *
 * AssetRegistry 只管理资源的稳定 ID、类型、包内路径和完整性元数据；它不
 * 解码图片、不创建音频对象，也不持有任何渲染器状态。
 */
export class AssetRegistry {
  private readonly assetsById = new Map<AssetId, AssetDefinition>();

  public constructor(definitions: readonly AssetDefinition[]) {
    if (!Array.isArray(definitions)) {
      throw new TypeError("assets must be an array");
    }

    for (const [index, definition] of definitions.entries()) {
      const asset = normalizeAsset(definition, `assets[${index}]`);
      if (this.assetsById.has(asset.id)) {
        throw new TypeError(`Duplicate asset ID '${asset.id}'`);
      }
      this.assetsById.set(asset.id, asset);
    }
  }

  /** 按稳定 ID 返回资源定义副本。 */
  public get(id: AssetId): AssetDefinition | undefined {
    const asset = this.assetsById.get(requireAssetId(id));
    return asset === undefined ? undefined : cloneAsset(asset);
  }

  /** 判断资源是否已登记。 */
  public has(id: AssetId): boolean {
    return this.get(id) !== undefined;
  }

  /** 按稳定 ID 要求资源存在。 */
  public require(id: AssetId): AssetDefinition {
    const asset = this.get(id);
    if (asset === undefined) {
      throw new RangeError(`Unknown asset '${id}'`);
    }
    return asset;
  }

  /** 返回所有资源定义副本，保持清单中的稳定顺序。 */
  public all(): readonly AssetDefinition[] {
    return [...this.assetsById.values()].map(cloneAsset);
  }

  /** 返回资源的规范化包内路径。 */
  public getPath(id: AssetId): VirtualPath {
    return VirtualPath.parse(this.require(id).path);
  }

  /** 导出规范化后的资源清单副本。 */
  public toDefinitions(): readonly AssetDefinition[] {
    return this.all();
  }
}

function normalizeAsset(value: unknown, path: string): AssetDefinition {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  const record = value as Record<string, unknown>;
  assertAllowedKeys(record, ["id", "kind", "path", "integrity"], path);

  const id = requireAssetId(record.id, `${path}.id`);
  if (typeof record.kind !== "string" || !ASSET_KINDS.includes(record.kind as AssetKind)) {
    throw new TypeError(`${path}.kind must be one of ${ASSET_KINDS.join(", ")}`);
  }
  if (typeof record.path !== "string" || record.path.trim().length === 0 || record.path.trim() !== record.path) {
    throw new TypeError(`${path}.path must be a non-empty path without surrounding whitespace`);
  }

  let normalizedPath: VirtualPath;
  try {
    normalizedPath = VirtualPath.parse(record.path);
  } catch (error) {
    throw withPath(error, `${path}.path`);
  }
  if (normalizedPath.isRoot || !normalizedPath.value.startsWith("assets/")) {
    throw new TypeError(`${path}.path must be stored under the assets/ directory`);
  }

  const integrity = record.integrity === undefined
    ? undefined
    : normalizeIntegrity(record.integrity, `${path}.integrity`);
  return {
    id,
    kind: record.kind as AssetKind,
    path: normalizedPath.value,
    ...(integrity === undefined ? {} : { integrity }),
  };
}

function normalizeIntegrity(value: unknown, path: string): AssetIntegrityDefinition {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  const record = value as Record<string, unknown>;
  assertAllowedKeys(record, ["algorithm", "digest"], path);
  if (record.algorithm !== "sha256") {
    throw new TypeError(`${path}.algorithm must be 'sha256'`);
  }
  if (typeof record.digest !== "string" || !/^[0-9a-fA-F]{64}$/.test(record.digest)) {
    throw new TypeError(`${path}.digest must be a 64-character SHA-256 hex digest`);
  }
  return { algorithm: "sha256", digest: record.digest.toLowerCase() };
}

function assertAllowedKeys(record: Record<string, unknown>, allowed: readonly string[], path: string): void {
  if (Object.getOwnPropertySymbols(record).length > 0) {
    throw new TypeError(`${path} must not contain symbol keys`);
  }
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) {
      throw new TypeError(`${path} contains unknown field '${key}'`);
    }
  }
}

function cloneAsset(asset: AssetDefinition): AssetDefinition {
  return {
    id: asset.id,
    kind: asset.kind,
    path: asset.path,
    ...(asset.integrity === undefined ? {} : { integrity: { ...asset.integrity } }),
  };
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
