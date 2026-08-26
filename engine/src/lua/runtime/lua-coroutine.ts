import { lua } from "fengari";
import { installContext, type LuaBindingHost } from "../api/context";
import type { LuaApiRegistry } from "../api/registry/lua-api-registry";
import { LuaRuntimeError, readLuaError } from "../errors/lua-error";
import { validateLuaResponse } from "../protocol/lua-response";
import type { LuaRequest, LuaResult } from "../protocol/lua-request";
import type { LuaResumeValue } from "../protocol/lua-response";
import { parseLuaRequest, parseLuaResult } from "../protocol/validators";
import { pushLuaValue, readLuaValue } from "../values/lua-value-codec";

export type LuaStep =
  | { kind: "request"; request: LuaRequest }
  | { kind: "completed"; result: LuaResult };

export class LuaCoroutine {
  private status: "new" | "suspended" | "completed" | "failed" | "cancelled" | "closed" = "new";
  private vmClosed = false;
  private pendingRequest: LuaRequest | null = null;

  public constructor(
    private readonly mainState: any,
    private readonly coroutineState: any,
    private readonly sourceName: string,
    private readonly host: LuaBindingHost,
    private readonly apiRegistry: LuaApiRegistry,
  ) {}

  public start(): LuaStep {
    if (this.status !== "new") {
      throw new Error(`Cannot start a Lua coroutine in '${this.status}' state`);
    }
    installContext(this.coroutineState, this.host, this.apiRegistry);
    return this.resumeNative(1);
  }

  public resume(value?: LuaResumeValue): LuaStep {
    if (this.status !== "suspended") {
      throw new Error(`Cannot resume a Lua coroutine in '${this.status}' state`);
    }
    if (this.pendingRequest !== null) {
      validateLuaResponse(this.pendingRequest, value);
      this.pendingRequest = null;
    }
    if (value !== undefined) {
      pushLuaValue(this.coroutineState, value);
      return this.resumeNative(1);
    }
    return this.resumeNative(0);
  }

  public cancel(reason = "Lua coroutine cancelled"): void {
    if (this.status === "closed" || this.status === "completed" || this.status === "failed" || this.status === "cancelled") {
      return;
    }
    this.status = "cancelled";
    this.closeVm();
    void reason;
  }

  public getStatus(): "new" | "suspended" | "completed" | "failed" | "cancelled" | "closed" {
    return this.status;
  }

  public close(): void {
    if (this.status === "closed") {
      return;
    }
    this.status = "closed";
    this.closeVm();
  }

  private resumeNative(argumentCount: number): LuaStep {
    const status = lua.lua_resume(this.coroutineState, this.mainState, argumentCount);
    if (status === lua.LUA_YIELD) {
      this.status = "suspended";
      this.pendingRequest = this.readRequest();
      return { kind: "request", request: this.pendingRequest };
    }
    if (status === lua.LUA_OK) {
      this.status = "completed";
      return { kind: "completed", result: this.readResult() };
    }

    this.status = "failed";
    throw readLuaError(this.coroutineState, this.sourceName, status);
  }

  private readRequest(): LuaRequest {
    const value = readLuaValue(this.coroutineState, -1);
    return parseLuaRequest(value, this.sourceName, lua.LUA_ERRRUN);
  }

  private readResult(): LuaResult {
    if (lua.lua_gettop(this.coroutineState) < 1) {
      throw new LuaRuntimeError(this.sourceName, lua.LUA_ERRRUN, "Scene function must return ctx.flow:exit(...) or ctx.flow:end_story()");
    }
    return parseLuaResult(readLuaValue(this.coroutineState, -1), this.sourceName, lua.LUA_ERRRUN);
  }

  private closeVm(): void {
    if (this.vmClosed) {
      return;
    }
    this.vmClosed = true;
    lua.lua_close(this.mainState);
  }
}
