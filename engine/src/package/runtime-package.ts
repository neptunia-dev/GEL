import type { CharacterDefinition } from "../character";
import type { SceneDefinition } from "../scene/scene-definition";
import type { VariableDefinition } from "../variables";
import type { RouteTableDefinition } from "./route-table";

/** 当前支持的 Runtime Package 清单格式版本。 */
export const RUNTIME_PACKAGE_FORMAT_VERSION = 1 as const;

/** 包内资源的稳定标识。 */
export type AssetId = string;

/** v1 资源类型；具体解码和播放由资源/表现层负责。 */
export type AssetKind = "image" | "audio" | "video" | "font" | "data";

/** 资源内容的可选完整性声明。 */
export interface AssetIntegrityDefinition {
  readonly algorithm: "sha256";
  readonly digest: string;
}

/** 清单中的资源声明。 */
export interface AssetDefinition {
  readonly id: AssetId;
  readonly kind: AssetKind;
  readonly path: string;
  readonly integrity?: AssetIntegrityDefinition;
}

/** 面向启动页、包管理器和编辑器的非逻辑元数据。 */
export interface PackageMetadataDefinition {
  readonly title?: string;
  readonly author?: string;
  readonly language?: string;
  readonly cover?: AssetId;
}

/** 当前包对引擎版本的最低要求。 */
export interface PackageEngineDefinition {
  readonly minVersion?: string;
}

/**
 * 编辑器导出的 Runtime Package v1 清单。
 *
 * 这是可序列化的包定义，不包含文件内容、Lua VM 或游戏会话状态。加载器会
 * 将它转换为 LoadedRuntimePackage；每个游戏会话再从后者创建独立的可变对象。
 */
export interface RuntimePackage {
  readonly formatVersion: number;
  readonly packageId: string;
  readonly packageVersion: string;
  readonly saveSchemaVersion: number;
  readonly entryScene: string;
  readonly engine?: PackageEngineDefinition;
  readonly metadata?: PackageMetadataDefinition;
  readonly assets: readonly AssetDefinition[];
  readonly characters: readonly CharacterDefinition[];
  readonly variables: readonly VariableDefinition[];
  readonly scenes: readonly SceneDefinition[];
  readonly routes: RouteTableDefinition;
}

/** 清单 DTO 的语义别名，便于调用方区分原始/已加载对象。 */
export type RuntimePackageManifest = RuntimePackage;
