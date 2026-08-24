/** Lua API 绑定层的统一错误。 */
export class LuaApiError extends Error {
  public readonly code: string;
  public readonly path: string;
  public readonly cause?: unknown;

  public constructor(path: string, code: string, message: string, cause?: unknown) {
    super(`${path}: ${message} [${code}]`);
    this.name = "LuaApiError";
    this.path = path;
    this.code = code;
    this.cause = cause;
  }
}

export function normalizeLuaApiError(path: string, error: unknown): LuaApiError {
  if (error instanceof LuaApiError) {
    return error.path === path ? error : new LuaApiError(path, error.code, error.message, error);
  }
  if (error instanceof TypeError) {
    return new LuaApiError(path, "E_ARGUMENT", error.message, error);
  }
  if (error instanceof RangeError) {
    return new LuaApiError(path, "E_RANGE", error.message, error);
  }
  if (error instanceof Error) {
    return new LuaApiError(path, "E_RUNTIME", error.message, error);
  }
  return new LuaApiError(path, "E_RUNTIME", String(error), error);
}
