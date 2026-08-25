import type { VirtualPath, VirtualPathLike } from "./virtual-path";

/**
 * 引擎读取逻辑文件所需的最小同步接口。
 *
 * 这里的“文件”是游戏包内部的逻辑文件，而不是宿主操作系统上的文件。
 * 例如 `scenes/prologue.lua` 在目录 provider 中会被映射到某个物理目录，
 * 在内存 provider 中则可能只是 Map 的一个键；调用方不需要知道这种差异。
 *
 * 接口刻意保持同步，因为当前 Lua 脚本加载、场景初始化和开发期 TUI 都是
 * 同步读取流程。将来接入异步归档时，可以在 package 层包一层异步调度，
 * 而不必让所有引擎领域对象都依赖 Node 的 `Buffer` 或文件句柄。
 */
export interface ReadonlyFileSystem {
  /**
   * 判断路径是否对应普通文件。
   *
   * 路径指向目录或不存在时返回 false；路径本身非法时仍然抛出
   * `FileSystemError("INVALID_PATH")`，这样调用方不会把拼写错误当成缺失文件。
   */
  hasFile(path: VirtualPathLike): boolean;

  /**
   * 读取文件的独立字节副本。
   *
   * 返回值可以由调用方自由修改，修改不会改变 provider 内部缓存或下一次
   * 读取的结果。文件不存在时抛出 `FILE_NOT_FOUND`，目录路径抛出
   * `NOT_A_FILE`。
   */
  readFile(path: VirtualPathLike): Uint8Array;

  /**
   * 以严格 UTF-8 读取文本。
   *
   * Lua、JSON 和清单文件都通过这个入口读取。遇到非法 UTF-8 字节序列时
   * 抛出 `INVALID_TEXT`，不会用替换字符静默吞掉编码错误。
   */
  readText(path: VirtualPathLike): string;

  /**
   * 列出 prefix 下的所有普通文件，并按逻辑路径稳定排序。
   *
   * 省略 prefix 时列出整个包；prefix 指向文件时返回该文件，指向目录或
   * 目录前缀时返回其后代文件。返回值只包含文件，不包含目录节点。
   */
  listFiles(prefix?: VirtualPathLike): readonly VirtualPath[];
}
