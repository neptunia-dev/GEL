/**
 * 场景在游戏工程中的稳定标识。
 *
 * 它不是展示标题，也不是 Lua 文件名；同一个 ID 会出现在包清单、路由表、
 * 存档元数据和诊断日志中。
 */
export type SceneId = string;

/**
 * 场景 ID 同时用于包清单、路由表、存档和日志，因此限制为稳定的 ASCII 标识符。
 * 显示给玩家的标题不应复用该字段，后续应由场景元数据单独提供。
 */
export const SCENE_ID_PATTERN = /^[a-z][a-z0-9_.-]*$/;

/**
 * 验证来自包数据或调用方的场景 ID。
 *
 * 这里故意不调用 trim()：例如 "prologue " 如果被静默改为 "prologue"，
 * 作者很难发现它与路由表或存档中的引用不一致。稳定标识应在边界直接拒绝。
 */
export function requireSceneId(value: unknown, name = "scene ID"): SceneId {
  if (typeof value !== "string" || !SCENE_ID_PATTERN.test(value)) {
    throw new TypeError(`${name} must match ${SCENE_ID_PATTERN.source}`);
  }
  return value;
}
