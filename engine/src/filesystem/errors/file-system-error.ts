/**
 * 文件系统操作失败时使用的稳定错误代码。
 *
 * 业务层应优先判断 code，而不是匹配不同 provider 产生的错误文本；message
 * 只用于日志和开发期提示，path 用来定位发生问题的逻辑路径。
 */
export type FileSystemErrorCode =
  /** 逻辑路径为空、绝对、越界或包含非法字符。 */
  | "INVALID_PATH"
  /** 请求的文件不存在。 */
  | "FILE_NOT_FOUND"
  /** 请求路径存在但指向目录或包根。 */
  | "NOT_A_FILE"
  /** 文件字节不是合法的 UTF-8 文本。 */
  | "INVALID_TEXT"
  /** provider 的根目录或底层读取环境不可用。 */
  | "INVALID_ROOT";

/**
 * 文件系统边界错误。
 *
 * 所有 provider 都把自己的底层异常转换成这个类型，因而 PackageLoader、
 * TUI 和测试代码可以使用同一套错误处理逻辑。`cause` 保留原始异常，便于
 * 开发阶段查看权限错误、系统调用失败等具体原因，但不要求上层依赖 Node
 * 的错误类型。
 */
export class FileSystemError extends Error {
  /** 稳定的机器可判断错误码。 */
  public readonly code: FileSystemErrorCode;
  /** 触发错误的逻辑路径；根目录错误也可能保存物理根路径。 */
  public readonly path: string | undefined;
  /** provider 捕获的原始异常；纯逻辑错误通常没有 cause。 */
  public readonly cause: unknown;

  public constructor(
    code: FileSystemErrorCode,
    message: string,
    path?: string,
    options?: { cause?: unknown },
  ) {
    super(message);
    // 显式设置 name，日志中可以区分普通 Error 和文件系统边界错误。
    this.name = "FileSystemError";
    this.code = code;
    this.path = path;
    this.cause = options?.cause;
  }
}
