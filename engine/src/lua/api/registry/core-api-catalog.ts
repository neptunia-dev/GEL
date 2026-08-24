import { DialogueApi } from "../implementations/dialogue-api";
import { FlowApi } from "../implementations/flow-api";
import { StageApi } from "../implementations/stage-api";
import { StateApi } from "../implementations/state-api";
import { TimeApi } from "../implementations/time-api";
import type { LuaApi } from "../api-base";
import type { LuaApiHost } from "../api-types";

/** 核心 API 的唯一清单；新增核心命名空间只需在这里加一行。 */
export function createCoreApis(host: LuaApiHost): readonly LuaApi[] {
  return [
    new DialogueApi(host),
    new StageApi(host),
    new StateApi(host),
    new FlowApi(host),
    new TimeApi(host),
  ];
}
