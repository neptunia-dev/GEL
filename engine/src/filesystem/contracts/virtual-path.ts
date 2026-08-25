import { FileSystemError } from "../errors/file-system-error";

/**
 * 可以传入字符串，也可以传入已经规范化的逻辑路径。
 *
 * provider 的公开方法接受这个联合类型，是为了让普通调用保持简洁：
 * `files.readText("scenes/start.lua")` 不需要调用方手动构造对象；在需要
 * 多次拼接或比较时，则可以复用同一个 `VirtualPath` 实例。
 */
export type VirtualPathLike = VirtualPath | string;

/** Windows 盘符前缀，例如 `C:` 或 `d:`。 */
const DRIVE_PREFIX = /^[A-Za-z]:/;

/**
 * 包内部使用的相对逻辑路径。
 *
 * VirtualPath 不访问宿主文件系统；它只负责把路径统一成 `/` 分隔，
 * 并确保路径不会离开包根目录。实例创建后不可变。
 *
 * 设计上的不变量：
 *
 * - 根路径用空字符串表示，只能通过 `root()` 创建；
 * - 普通路径只包含 `/` 分隔的规范化段；
 * - 不保存开头或结尾的分隔符，也不保存 `.` 和已经抵消的 `..`；
 * - 绝对路径、盘符路径、NUL 字符和越过根目录的路径都会在边界抛错。
 *
 * 这个对象表示“包内路径”，不是 `node:path` 的 `resolve()` 结果，因此
 * 不应该把它直接传给 `fs.readFileSync`；物理路径转换属于 provider 内部。
 */
export class VirtualPath {
  /** normalized 已经满足本类不变量，后续方法不再重复做系统路径解析。 */
  private constructor(private readonly normalized: string) {}

  /**
   * 返回包根目录。
   *
   * 根路径的字符串表示为空字符串。空字符串故意不作为普通输入接受，
   * 这样 `readFile("")` 不会把“未提供文件名”和“读取包根”混在一起。
   */
  public static root(): VirtualPath {
    return new VirtualPath("");
  }

  /**
   * 将外部字符串解析为规范化的相对路径。
   *
   * 解析分成三步：先统一分隔符，再逐段处理 `.`/`..`，最后用 `/` 重新
   * 拼接。`a/../b` 会得到 `b`，但 `../b` 会被拒绝，因为它试图访问包外。
   * `.` 或 `a/..` 这样的相对输入可以规范化为根路径，适合目录列表操作。
   */
  public static parse(input: string): VirtualPath {
    if (typeof input !== "string") {
      throw new TypeError("Virtual path must be a string");
    }

    // 逻辑路径无论来自 Windows 还是 POSIX，都在这里统一成 `/`。
    const slashPath = input.replaceAll("\\", "/");
    if (slashPath.includes("\0")) {
      throw invalidPath(input, "path contains a NUL character");
    }
    // `/x`、`//server/x` 和 `C:/x` 都属于宿主路径，不属于包内路径。
    if (slashPath.startsWith("/") || DRIVE_PREFIX.test(slashPath)) {
      throw invalidPath(input, "absolute paths are not allowed");
    }
    if (slashPath.length === 0) {
      throw invalidPath(input, "path is empty; use VirtualPath.root() for the root");
    }

    const segments: string[] = [];
    for (const segment of slashPath.split("/")) {
      // 连续分隔符和当前目录段不改变逻辑路径，可以直接丢弃。
      if (segment.length === 0 || segment === ".") {
        continue;
      }
      if (segment === "..") {
        // 没有可回退的段时，说明路径已经越过包根目录。
        if (segments.length === 0) {
          throw invalidPath(input, "path escapes the package root");
        }
        segments.pop();
        continue;
      }
      segments.push(segment);
    }

    return new VirtualPath(segments.join("/"));
  }

  /**
   * 将路径值或字符串统一转换为 VirtualPath。
   *
   * 已经是值对象时直接返回原实例，避免在 provider 的每个方法中重复规范化；
   * 字符串则经过完整解析，因此所有入口仍共享相同的路径规则。
   */
  public static from(input: VirtualPathLike): VirtualPath {
    return input instanceof VirtualPath ? input : VirtualPath.parse(input);
  }

  public get value(): string {
    return this.normalized;
  }

  /** 当前路径是否表示包根目录。 */
  public get isRoot(): boolean {
    return this.normalized.length === 0;
  }

  /**
   * 在当前路径下拼接相对部分，并重新规范化。
   *
   * 每个 part 都必须是相对片段；允许其中出现 `..`，最终仍由 `parse()`
   * 检查是否越过根目录。绝对片段会立即拒绝，避免类似操作系统
   * `resolve(base, absolute)` 那样悄悄丢弃 base。
   */
  public join(...parts: VirtualPathLike[]): VirtualPath {
    if (parts.length === 0) {
      return this;
    }

    const values = [this.normalized];
    for (const part of parts) {
      const value = part instanceof VirtualPath ? part.value : part;
      assertRelativePart(value);
      values.push(value);
    }

    const combined = values.filter((value) => value.length > 0).join("/");
    return combined.length === 0 ? VirtualPath.root() : VirtualPath.parse(combined);
  }

  /**
   * 返回父路径；根路径没有父路径。
   *
   * 返回 null 而不是再次返回根路径，可以让调用方区分“已经在根”与“父目录
   * 恰好是根”。例如 `scenes` 的 parent 是 root，而 root 的 parent 是 null。
   */
  public parent(): VirtualPath | null {
    if (this.isRoot) {
      return null;
    }
    const separator = this.normalized.lastIndexOf("/");
    return separator < 0
      ? VirtualPath.root()
      : new VirtualPath(this.normalized.slice(0, separator));
  }

  /** 返回最后一个路径段；根路径没有 basename，因此返回空字符串。 */
  public basename(): string {
    if (this.isRoot) {
      return "";
    }
    const separator = this.normalized.lastIndexOf("/");
    return separator < 0 ? this.normalized : this.normalized.slice(separator + 1);
  }

  /**
   * 返回包含点号的扩展名；没有扩展名时返回 null。
   *
   * 只检查 basename 的最后一个点：`.env` 不被当作扩展名，`story.lua`
   * 返回 `.lua`，`archive.tar.gz` 返回 `.gz`。
   */
  public extension(): string | null {
    const name = this.basename();
    const dot = name.lastIndexOf(".");
    return dot <= 0 || dot === name.length - 1 ? null : name.slice(dot);
  }

  /** 按规范化后的逻辑字符串比较，不比较对象身份。 */
  public equals(other: VirtualPathLike): boolean {
    return this.normalized === VirtualPath.from(other).normalized;
  }

  /** 供日志、Map 调试和字符串插值使用。 */
  public toString(): string {
    return this.normalized;
  }

  /** 让 JSON.stringify 输出逻辑路径字符串，而不是私有字段结构。 */
  public toJSON(): string {
    return this.normalized;
  }
}

/** 检查 join 的单个片段仍然是相对值；越界由最终 parse 统一处理。 */
function assertRelativePart(value: string): void {
  const slashValue = value.replaceAll("\\", "/");
  if (slashValue.includes("\0")) {
    throw invalidPath(value, "path contains a NUL character");
  }
  if (slashValue.startsWith("/") || DRIVE_PREFIX.test(slashValue)) {
    throw invalidPath(value, "joined path parts must be relative");
  }
}

/** 创建带原始输入和稳定错误码的路径错误。 */
function invalidPath(input: string, reason: string): FileSystemError {
  return new FileSystemError("INVALID_PATH", `Invalid virtual path '${input}': ${reason}`, input);
}
