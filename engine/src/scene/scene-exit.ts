/** Lua 场景执行结束时返回的出口结果。 */
export interface SceneExit {
  type: "exit";
  port: string;
}

/** Lua 场景主动结束整个剧情时返回的结果。 */
export interface SceneEnd {
  type: "end";
}

export type SceneResult = SceneExit | SceneEnd;
