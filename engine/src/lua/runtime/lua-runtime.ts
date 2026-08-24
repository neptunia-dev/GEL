import { LuaCoroutine, type LuaStep } from "./lua-coroutine";
import { loadLuaScript } from "./script-loader";
import { createCoreLuaApiRegistry } from "../api/context";
import type { LuaApiFactory, LuaBindingHost } from "../api/context";
import { validateLuaResponse } from "../protocol/lua-response";
import type { LuaRequest, LuaResult } from "../protocol/lua-request";
import type { LuaResumeValue } from "../protocol/lua-response";
import type { LuaPresentationEvent } from "../protocol/presentation-command";
import type { LuaCapability, LuaValue } from "../values/lua-types";
import type { LuaSandboxOptions } from "../sandbox/lua-sandbox";

export interface LuaRequestHandler {
  (request: LuaRequest): LuaResumeValue | Promise<LuaResumeValue>;
}

export interface LuaRunOptions {
  sourceName?: string;
  variables?: Record<string, LuaValue>;
  signal?: AbortSignal;
  sandbox?: LuaSandboxOptions;
  characterIds?: readonly string[];
  exits?: readonly string[];
  capabilities?: readonly LuaCapability[];
  onPresentation?: (event: LuaPresentationEvent) => void;
  /** 开发期扩展 API；每次 runtime 创建独立实例。 */
  apiFactories?: readonly LuaApiFactory[];
}

export class LuaRuntime {
  public create(source: string, options: LuaRunOptions = {}): LuaCoroutine {
    const sourceName = options.sourceName ?? "=(scene)";
    const host: LuaBindingHost = {
      variables: new Map(Object.entries(options.variables ?? {})),
      characterIds: options.characterIds === undefined ? undefined : new Set(options.characterIds),
      exits: options.exits === undefined ? undefined : new Set(options.exits),
      capabilities: options.capabilities === undefined ? undefined : new Set(options.capabilities),
      emit: options.onPresentation === undefined ? undefined : (command) => options.onPresentation?.({ type: "presentation", command }),
    };
    const loaded = loadLuaScript(source, sourceName, options.sandbox);
    const registry = createCoreLuaApiRegistry(host, options.apiFactories);
    return new LuaCoroutine(loaded.mainState, loaded.coroutineState, sourceName, host, registry);
  }

  public async run(source: string, handler: LuaRequestHandler, options: LuaRunOptions = {}): Promise<LuaResult> {
    const coroutine = this.create(source, options);
    try {
      throwIfAborted(options.signal);
      let step: LuaStep = coroutine.start();
      while (step.kind === "request") {
        throwIfAborted(options.signal);
        const response = await handler(step.request);
        throwIfAborted(options.signal);
        validateLuaResponse(step.request, response);
        step = coroutine.resume(response);
      }
      return step.result;
    } catch (error) {
      if (isAbortError(error)) {
        coroutine.close();
        throw error;
      }
      throw error;
    } finally {
      if (options.variables) {
        for (const key of Object.keys(options.variables)) {
          delete options.variables[key];
        }
        Object.assign(options.variables, coroutine.getVariableSnapshot());
      }
      if (coroutine.getStatus() !== "closed") {
        coroutine.close();
      }
    }
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("Lua run cancelled", "AbortError");
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
