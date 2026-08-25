import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ReadonlyFileSystem } from "../contracts/file-system";
import { VirtualPath, type VirtualPathLike } from "../contracts/virtual-path";
import { FileSystemError } from "../errors/file-system-error";
import { decodeUtf8 } from "../utf8-decoder";

/**
 * 将一个宿主目录映射为包内逻辑文件系统。
 *
 * 这是开发阶段最常用的 provider：游戏工程可以保持普通目录结构，Lua、
 * manifest 和资源文件都能直接被编辑器或命令行查看。只有本类接触
 * `node:fs`、`node:path` 和 `node:url`；上层永远只传入 VirtualPathLike。
 *
 * rootDirectory 保存 realpath 后的绝对根目录。每次逻辑路径转换都会做一次
 * lexical containment 检查，保证 `..` 或组合路径不会把读取目标解析到根目录
 * 之外。目录遍历只返回普通文件，目录本身不会出现在 listFiles 结果中。
 */
export class DirectoryFileSystem implements ReadonlyFileSystem {
  /** 已解析、已规范化的宿主根目录。 */
  private readonly rootDirectory: string;

  /**
   * 创建目录 provider。
   *
   * 字符串会按当前工作目录解析；file URL 会先转换成宿主路径。构造时立即
   * 检查目标存在且为目录，并解析根目录的真实路径，后续所有读取共享这个
   * 固定根。根目录不可读或不是目录时统一抛出 INVALID_ROOT。
   */
  public constructor(root: string | URL) {
    let requestedRoot = typeof root === "string" ? resolve(root) : "<invalid URL>";
    try {
      if (typeof root !== "string") {
        requestedRoot = resolve(fileURLToPath(root));
      }
      if (!statSync(requestedRoot).isDirectory()) {
        throw new Error("path is not a directory");
      }
      this.rootDirectory = realpathSync(requestedRoot);
    } catch (error) {
      throw new FileSystemError(
        "INVALID_ROOT",
        `Package root is not a readable directory: '${requestedRoot}'`,
        requestedRoot,
        { cause: error },
      );
    }
  }

  /**
   * 返回规范化后的宿主根目录，便于 CLI 显示或构造日志 sourceName。
   *
   * 这是物理路径的只读观察值；它不应被拼接到 Lua 脚本中的逻辑路径上。
   */
  public get root(): string {
    return this.rootDirectory;
  }

  /**
   * 判断逻辑路径是否解析为普通文件。
   *
   * ENOENT/ENOTDIR 被解释为 false，权限或其他系统错误则转换成
   * FileSystemError，避免把真实读取故障伪装成“文件不存在”。
   */
  public hasFile(path: VirtualPathLike): boolean {
    const target = this.resolvePath(path);
    if (target.virtual.isRoot) {
      return false;
    }
    try {
      return statSync(target.physical).isFile();
    } catch (error) {
      if (isMissing(error)) {
        return false;
      }
      throw this.providerError("Cannot inspect file", target.virtual, error);
    }
  }

  /**
   * 读取目录中的二进制文件并返回独立 Uint8Array。
   *
   * 先 stat 再 read 是为了区分目录和缺失文件，并把 Node 的 ENOENT、
   * 非文件路径等情况映射为统一错误码。Buffer 不会泄漏到 filesystem 契约。
   */
  public readFile(path: VirtualPathLike): Uint8Array {
    const target = this.resolvePath(path);
    if (target.virtual.isRoot) {
      throw new FileSystemError("NOT_A_FILE", "The package root is not a file", target.virtual.value);
    }

    let stats: ReturnType<typeof statSync>;
    try {
      stats = statSync(target.physical);
    } catch (error) {
      if (isMissing(error)) {
        throw new FileSystemError("FILE_NOT_FOUND", `File not found: '${target.virtual.value}'`, target.virtual.value);
      }
      throw this.providerError("Cannot inspect file", target.virtual, error);
    }
    if (!stats.isFile()) {
      throw new FileSystemError("NOT_A_FILE", `Path is not a file: '${target.virtual.value}'`, target.virtual.value);
    }

    try {
      return new Uint8Array(readFileSync(target.physical));
    } catch (error) {
      if (isMissing(error)) {
        throw new FileSystemError("FILE_NOT_FOUND", `File not found: '${target.virtual.value}'`, target.virtual.value);
      }
      throw this.providerError("Cannot read file", target.virtual, error);
    }
  }

  /** 将 readFile 的字节交给严格 UTF-8 解码器。 */
  public readText(path: VirtualPathLike): string {
    const virtualPath = VirtualPath.from(path);
    return decodeUtf8(this.readFile(virtualPath), virtualPath.value);
  }

  /**
   * 从 prefix 开始递归列出普通文件。
   *
   * prefix 不存在时返回空数组，便于 PackageLoader 探测可选目录；prefix
   * 指向文件时返回该文件本身。读取目录项后再通过 VirtualPath.join 构造
   * 逻辑路径，最终结果按统一的字符串顺序排序，保证目录 provider 与
   * MemoryFileSystem 的结果可比较。
   */
  public listFiles(prefix?: VirtualPathLike): readonly VirtualPath[] {
    const prefixPath = prefix === undefined ? VirtualPath.root() : VirtualPath.from(prefix);
    const target = this.resolvePath(prefixPath);
    let stats: ReturnType<typeof statSync>;
    try {
      stats = statSync(target.physical);
    } catch (error) {
      if (isMissing(error)) {
        return [];
      }
      throw this.providerError("Cannot inspect path", prefixPath, error);
    }

    if (stats.isFile()) {
      return [prefixPath];
    }
    if (!stats.isDirectory()) {
      return [];
    }

    const result: VirtualPath[] = [];
    this.collectFiles(target.physical, prefixPath, result);
    result.sort((left, right) => (left.value < right.value ? -1 : left.value > right.value ? 1 : 0));
    return result;
  }

  /**
   * 递归遍历一个已经确认是目录的物理路径。
   *
   * Dirent 只把普通目录和普通文件纳入结果；其他类型（例如特殊设备节点）
   * 不属于运行时包资源，直接跳过。每次递归都重新通过 resolvePath 检查
   * 逻辑子路径，保持物理路径和逻辑路径一一对应。
   */
  private collectFiles(directory: string, prefix: VirtualPath, result: VirtualPath[]): void {
    let entries: import("node:fs").Dirent<string>[];
    try {
      entries = readdirSync(directory, { withFileTypes: true, encoding: "utf8" });
    } catch (error) {
      throw this.providerError("Cannot list directory", prefix, error);
    }

    for (const entry of entries) {
      const child = prefix.join(entry.name);
      const physical = this.resolvePath(child).physical;
      if (entry.isDirectory()) {
        this.collectFiles(physical, child, result);
      } else if (entry.isFile()) {
        result.push(child);
      }
    }
  }

  /**
   * 把逻辑路径转换为物理路径，并执行 lexical 根目录约束。
   *
   * 这里使用 path.resolve 只做拼接，不把用户传入的绝对片段当成新根；
   * VirtualPath 已经拒绝绝对路径，relative 检查则是第二道边界，防止未来
   * 修改路径拼接逻辑时遗漏根目录约束。
   */
  private resolvePath(path: VirtualPathLike): { virtual: VirtualPath; physical: string } {
    const virtual = VirtualPath.from(path);
    const physical = resolve(this.rootDirectory, ...splitSegments(virtual));
    const relativePath = relative(this.rootDirectory, physical);
    if (isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
      throw new FileSystemError("INVALID_PATH", `Path escapes package root: '${virtual.value}'`, virtual.value);
    }
    return { virtual, physical };
  }

  /** 将非缺失类 Node 异常包装为 provider 层错误，并保留 cause。 */
  private providerError(operation: string, path: VirtualPath, cause: unknown): FileSystemError {
    return new FileSystemError("INVALID_ROOT", `${operation}: '${path.value}'`, path.value, { cause });
  }
}

/** 把 `/` 分隔的逻辑路径拆成 path.resolve 可接受的相对段。 */
function splitSegments(path: VirtualPath): string[] {
  return path.isRoot ? [] : path.value.split("/");
}

/** 判断 Node 文件 API 错误是否代表目标不存在或中间段不是目录。 */
function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    ((error as { code?: unknown }).code === "ENOENT" || (error as { code?: unknown }).code === "ENOTDIR");
}
