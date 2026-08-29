/** PackageLoader 在清单或包内容无效时使用的稳定错误代码。 */
export type PackageLoadErrorCode =
  | "INVALID_MANIFEST"
  | "UNSUPPORTED_FORMAT"
  | "INCOMPATIBLE_ENGINE"
  | "INVALID_REFERENCE"
  | "FILE_NOT_FOUND"
  | "INVALID_SCRIPT"
  | "INTEGRITY_MISMATCH";

/**
 * 游戏包加载边界错误。
 *
 * path 是 manifest 字段路径或包内逻辑路径，便于编辑器直接定位错误字段。
 * cause 保留底层错误，但调用方不需要依赖具体 provider 或 Lua 实现。
 */
export class PackageLoadError extends Error {
  public readonly code: PackageLoadErrorCode;
  public readonly path: string;
  public readonly cause: unknown;

  public constructor(code: PackageLoadErrorCode, path: string, message: string, cause?: unknown) {
    super(`${path}: ${message}`);
    this.name = "PackageLoadError";
    this.code = code;
    this.path = path;
    this.cause = cause;
  }
}
