import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { Readable, Writable } from "node:stream";
import {
  LuaRuntime,
  type LuaRequest,
  type LuaResumeValue,
  type LuaResult,
} from "../lua";
import { GameState, type VariableDefinition } from "../variables";
import { BlessedRenderer } from "./blessed-renderer";
import { TuiSession } from "./tui-session";

export interface TuiLuaAppOptions {
  input?: Readable;
  output?: Writable;
  title?: string;
  sceneId?: string;
  /** 可选的共享游戏状态；未提供时使用无变量的开发状态。 */
  state?: GameState;
  /** 内嵌 Lua 源码；提供后不读取 luaPath 文件。 */
  source?: string;
  /** Lua runtime 使用的源名称；默认使用 luaPath 的绝对路径。 */
  sourceName?: string;
  characterIds?: readonly string[];
  exits?: readonly string[];
}

interface PendingInput {
  readonly request: LuaRequest;
  readonly resolve: (value: LuaResumeValue) => void;
}

/**
 * 使用 Lua 文件启动开发期 TUI。
 *
 * TUI 只负责把 Lua runtime 的请求转换成键盘输入，并把舞台命令应用到
 * TuiSession；它不解析 Lua 文本，也不参与场景路由。
 */
export class TuiLuaApp {
  public readonly session: TuiSession;
  public readonly renderer: BlessedRenderer;

  private readonly sourcePath: string;
  private readonly source: string;
  private readonly state: GameState;
  private readonly runtime = new LuaRuntime();
  private readonly abortController = new AbortController();
  private readonly characterIds: readonly string[] | undefined;
  private readonly exits: readonly string[] | undefined;
  private pending: PendingInput | null = null;
  private started = false;

  public constructor(luaPath: string, options: TuiLuaAppOptions = {}) {
    this.sourcePath = options.sourceName ?? resolve(luaPath);
    this.source = options.source ?? readFileSync(resolve(luaPath), "utf8");
    const sceneId = options.sceneId ?? basename(this.sourcePath).replace(/\.[^.]+$/, "");
    this.session = new TuiSession(sceneId);
    this.state = options.state ?? createDefaultState(sceneId);
    this.renderer = new BlessedRenderer({
      input: options.input,
      output: options.output,
      title: options.title ?? `GEL TUI - ${sceneId}`,
    });
    this.characterIds = options.characterIds;
    this.exits = options.exits;
  }

  /** 启动终端并运行 Lua 场景；按 Q 退出时返回 undefined。 */
  public async start(): Promise<LuaResult | undefined> {
    if (this.started) {
      throw new Error("TUI Lua app has already started");
    }
    this.started = true;
    this.bindKeys();
    this.renderer.screen.on("resize", () => this.render());
    this.render();

    try {
      return await this.runtime.run(this.source, (request) => this.waitForInput(request), {
        state: this.state,
        sourceName: this.sourcePath,
        characterIds: this.characterIds,
        exits: this.exits,
        signal: this.abortController.signal,
        onPresentation: (event) => {
          this.session.applyPresentation(event.command);
          this.render();
        },
      });
    } catch (error) {
      if (isAbortError(error)) {
        return undefined;
      }
      throw error;
    } finally {
      this.pending = null;
      this.renderer.destroy();
    }
  }

  private waitForInput(request: LuaRequest): Promise<LuaResumeValue> {
    if (this.pending !== null) {
      throw new Error("TUI received a Lua request while another request is pending");
    }
    this.session.presentRequest(request);
    this.render();
    return new Promise<LuaResumeValue>((resolveInput) => {
      this.pending = { request, resolve: resolveInput };
    });
  }

  private bindKeys(): void {
    this.renderer.bind(["enter", "space"], () => this.confirm());
    this.renderer.bind(["up"], () => {
      this.session.moveChoice(-1);
      this.render();
    });
    this.renderer.bind(["down"], () => {
      this.session.moveChoice(1);
      this.render();
    });
    this.renderer.bind(["b", "backspace"], () => {
      if (this.session.goBack()) {
        this.render();
      }
    });
    this.renderer.bind(["q", "C-c"], () => {
      this.abortController.abort();
      this.resolvePending(undefined);
    });
  }

  private confirm(): void {
    const pending = this.pending;
    if (pending === null) {
      return;
    }
    if (pending.request.type === "choice") {
      const selected = this.session.getSelectedChoice();
      if (selected === null) {
        return;
      }
      this.resolvePending(selected);
      return;
    }
    // 对话和等待都是“按键继续”，不向 Lua 传回业务值。
    this.resolvePending(undefined);
  }

  private resolvePending(value: LuaResumeValue): void {
    const pending = this.pending;
    if (pending === null) {
      return;
    }
    this.pending = null;
    pending.resolve(value);
  }

  private render(): void {
    this.renderer.render(this.session);
  }
}

function createDefaultState(sceneId: string): GameState {
  const variables: readonly VariableDefinition[] = [];
  return new GameState({ packageId: "tui", schemaVersion: 1, sceneId, variables });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
