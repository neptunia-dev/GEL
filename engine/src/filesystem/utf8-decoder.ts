import { FileSystemError } from "./errors/file-system-error";

/**
 * 使用严格 UTF-8 解码；非法字节序列会转换为统一的文件系统错误。
 *
 * TextDecoder 默认会把坏字节替换成 `�`，这会让损坏的 Lua 或 JSON 看起来
 * 像是合法内容。这里打开 fatal 模式，让问题在资源加载边界立即暴露，并
 * 把浏览器/Node 的底层 TypeError 统一包装为 `INVALID_TEXT`。
 */
export function decodeUtf8(bytes: Uint8Array, path: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new FileSystemError("INVALID_TEXT", `File is not valid UTF-8: '${path}'`, path, { cause: error });
  }
}
