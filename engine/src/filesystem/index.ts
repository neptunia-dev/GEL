/**
 * filesystem 模块的稳定公共出口。
 *
 * 上层只从这里导入类型和值对象；具体 provider 的实现文件可以继续调整，
 * 只要这些公共名称保持不变，PackageLoader 和 TUI 就不需要跟着改动。
 */
export { FileSystemError } from "./errors/file-system-error";
export type { FileSystemErrorCode } from "./errors/file-system-error";

// 契约和值对象：上层模块只依赖这些名称，不直接依赖 provider 的实现细节。
export type { ReadonlyFileSystem } from "./contracts/file-system";
export { VirtualPath } from "./contracts/virtual-path";
export type { VirtualPathLike } from "./contracts/virtual-path";

// 编码工具：所有文本 provider 共享同一套严格 UTF-8 行为。
export { decodeUtf8 } from "./utf8-decoder";

// 第一阶段 provider：开发目录和内存映射；归档 provider 在后续阶段加入。
export { DirectoryFileSystem } from "./providers/directory-file-system";
export {
  MemoryFileSystem,
  type MemoryFileContent,
  type MemoryFileSystemInput,
} from "./providers/memory-file-system";
