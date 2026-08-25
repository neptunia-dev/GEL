import type { ReadonlyFileSystem } from "../contracts/file-system";
import { VirtualPath, type VirtualPathLike } from "../contracts/virtual-path";
import { FileSystemError } from "../errors/file-system-error";
import { decodeUtf8 } from "../utf8-decoder";

/** 内存文件可以直接用文本初始化，也可以用二进制字节初始化。 */
export type MemoryFileContent = string | Uint8Array;

/**
 * MemoryFileSystem 支持的输入形态。
 *
 * - 普通对象适合在测试中快速写少量资源；
 * - Map 或键值 iterable 适合动态构造，也允许键使用 VirtualPath；
 * - 无论输入来自哪种形态，构造完成后都会转成内部的规范化 Map。
 */
export type MemoryFileSystemInput =
  | ReadonlyMap<VirtualPathLike, MemoryFileContent>
  | Iterable<readonly [VirtualPathLike, MemoryFileContent]>
  | Readonly<Record<string, MemoryFileContent>>;

/**
 * 基于 Map 的只读文件系统；构造和读取都会复制字节。
 *
 * 这个 provider 不模拟目录节点：Map 中只保存文件。`listFiles("scenes")`
 * 通过路径前缀推导后代关系，因此即使没有单独的目录记录，也能与目录
 * provider 返回一致的逻辑文件列表。重复规范化路径会直接报错，避免
 * `a/../b` 和 `b` 在构造顺序不同的情况下产生隐蔽覆盖。
 */
export class MemoryFileSystem implements ReadonlyFileSystem {
  /** key 是 VirtualPath.value；value 永远是 provider 自己拥有的字节副本。 */
  private readonly files = new Map<string, Uint8Array>();

  /**
   * 从对象、Map 或键值 iterable 构造内存文件系统。
   *
   * 字符串会在这里编码为 UTF-8，传入的 Uint8Array 也会立即复制；因此
   * 调用方在构造后修改原始输入，不会改变文件系统内容。
   */
  public constructor(input: MemoryFileSystemInput = {}) {
    for (const [path, content] of entriesOf(input)) {
      this.add(path, content);
    }
  }

  /**
   * 判断一个逻辑路径是否有对应文件。
   *
   * 根路径和仅作为前缀存在的目录都返回 false；路径规范化错误仍然向上抛出。
   */
  public hasFile(path: VirtualPathLike): boolean {
    const virtualPath = VirtualPath.from(path);
    return !virtualPath.isRoot && this.files.has(virtualPath.value);
  }

  /**
   * 返回文件的独立字节副本。
   *
   * 每次读取都 new Uint8Array，防止调用方通过返回值修改内部 Map；根路径
   * 和不存在路径分别映射为 NOT_A_FILE 与 FILE_NOT_FOUND。
   */
  public readFile(path: VirtualPathLike): Uint8Array {
    const virtualPath = VirtualPath.from(path);
    if (virtualPath.isRoot) {
      throw new FileSystemError("NOT_A_FILE", "The package root is not a file", virtualPath.value);
    }
    const content = this.files.get(virtualPath.value);
    if (content === undefined) {
      throw new FileSystemError("FILE_NOT_FOUND", `File not found: '${virtualPath.value}'`, virtualPath.value);
    }
    return new Uint8Array(content);
  }

  /** 使用统一的严格 UTF-8 解码器读取文本文件。 */
  public readText(path: VirtualPathLike): string {
    const virtualPath = VirtualPath.from(path);
    return decodeUtf8(this.readFile(virtualPath), virtualPath.value);
  }

  /**
   * 按逻辑前缀列出文件。
   *
   * 匹配使用完整路径段边界：prefix 为 `scenes` 时会匹配 `scenes/a.lua`，
   * 不会误匹配 `scenes-old/a.lua`。如果 Map 中恰好有名为 `scenes` 的文件，
   * 它也会作为精确匹配出现在结果中。
   */
  public listFiles(prefix?: VirtualPathLike): readonly VirtualPath[] {
    const prefixPath = prefix === undefined ? VirtualPath.root() : VirtualPath.from(prefix);
    const prefixValue = prefixPath.value;
    const values = [...this.files.keys()]
      .filter((value) =>
        prefixPath.isRoot || value === prefixValue || value.startsWith(`${prefixValue}/`),
      )
      .sort(comparePaths);
    return values.map((value) => VirtualPath.parse(value));
  }

  /** 规范化并登记一项输入，同时检查根路径和重复键。 */
  private add(path: VirtualPathLike, content: MemoryFileContent): void {
    const virtualPath = VirtualPath.from(path);
    if (virtualPath.isRoot) {
      throw new FileSystemError("NOT_A_FILE", "The package root cannot be a file", virtualPath.value);
    }
    if (this.files.has(virtualPath.value)) {
      throw new FileSystemError(
        "INVALID_PATH",
        `Duplicate virtual file path: '${virtualPath.value}'`,
        virtualPath.value,
      );
    }
    this.files.set(virtualPath.value, encodeContent(content));
  }
}

/** 把三种公开输入形态统一为键值 iterable。 */
function entriesOf(input: MemoryFileSystemInput): Iterable<readonly [VirtualPathLike, MemoryFileContent]> {
  if (input instanceof Map || isIterable(input)) {
    return input;
  }
  return Object.entries(input);
}

/** 运行时识别自定义 iterable；普通记录对象会走 Object.entries 分支。 */
function isIterable(value: unknown): value is Iterable<readonly [VirtualPathLike, MemoryFileContent]> {
  return typeof value === "object" && value !== null && Symbol.iterator in value;
}

/** 将公开输入转换成 provider 自己拥有的字节数组。 */
function encodeContent(content: MemoryFileContent): Uint8Array {
  return typeof content === "string" ? new TextEncoder().encode(content) : new Uint8Array(content);
}

/** 使用简单码点比较，避免受主机 locale 影响而改变包文件顺序。 */
function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
