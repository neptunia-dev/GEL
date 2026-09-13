import { LuaRuntime, type LuaRequest, type LuaResumeValue, type LuaResult } from "../lua";
import { GameState } from "../variables";
import { TuiSession } from "../tui/tui-session";
import { WebGLStage } from "../webgl";

export interface WebPlayerOptions {
  readonly root: HTMLElement; readonly source: string; readonly state: GameState;
  readonly sourceName?: string; readonly title?: string; readonly characterIds?: readonly string[];
  readonly exits?: readonly string[]; readonly assets?: Readonly<Record<string, string>>;
  readonly onComplete?: (result: LuaResult) => void;
}

/** Browser host: Lua runtime + fully WebGL-rendered stage, dialogue, and choices. */
export class WebPlayer {
  public readonly session: TuiSession;
  public readonly stage: WebGLStage;
  private readonly runtime = new LuaRuntime();
  private readonly abortController = new AbortController();
  private readonly options: WebPlayerOptions;
  private pending: { request: LuaRequest; resolve: (value: LuaResumeValue) => void } | null = null;
  private started = false;
  private readonly elements: Record<string, HTMLElement> = {};

  public constructor(options: WebPlayerOptions) {
    this.options = options; this.session = new TuiSession(options.state.sceneId);
    this.mount(options.title ?? "GEL / PLAY");
    this.stage = new WebGLStage({ canvas: this.options.root.querySelector("canvas") as HTMLCanvasElement });
    window.addEventListener("resize", () => this.render());
    void this.loadAssets();
  }

  public async start(): Promise<LuaResult | undefined> {
    if (this.started) throw new Error("WebPlayer has already started"); this.started = true; void this.render();
    try {
      const result = await this.runtime.run(this.options.source, request => this.waitForInput(request), {
        state: this.options.state, sourceName: this.options.sourceName, characterIds: this.options.characterIds,
        exits: this.options.exits, signal: this.abortController.signal,
        onPresentation: event => { this.session.applyPresentation(event.command); void this.render(); },
      }); this.options.onComplete?.(result); return result;
    } catch (error) { if (error instanceof DOMException && error.name === "AbortError") return undefined; throw error; }
  }

  public destroy(): void { this.abortController.abort(); this.stage.dispose(); this.options.root.replaceChildren(); }

  private async loadAssets(): Promise<void> {
    const assets = this.options.assets ?? {};
    if (assets.background) await this.stage.setBackground("background", assets.background);
    for (const character of this.options.characterIds ?? []) { const url = assets[character]; if (url) await this.stage.setCharacterTexture(character, url); }
    void this.render();
  }

  private waitForInput(request: LuaRequest): Promise<LuaResumeValue> {
    this.session.presentRequest(request); void this.render();
    if (request.type === "wait") return new Promise(resolve => window.setTimeout(() => resolve(undefined), Math.max(0, request.seconds) * 1000));
    return new Promise(resolve => { this.pending = { request, resolve }; });
  }

  private mount(title: string): void {
    const root = this.options.root; root.className = "gel-player";
    root.innerHTML = `<main class="gel-stage"><canvas aria-label="游戏舞台"></canvas><div class="gel-scene-label" data-scene></div></main><header class="gel-topbar"><div class="gel-brand"><span class="gel-mark">✦</span><span>${escapeHtml(title)}</span></div><div class="gel-status"><span class="gel-live"></span> LIVE <button data-action="menu" aria-label="打开菜单">⋯</button></div></header><footer class="gel-bottombar"><button data-action="back">‹ <span>返回</span></button><div class="gel-progress"><span></span></div><button data-action="auto">▷ <span>自动</span></button><button data-action="save">▣ <span>存档</span></button></footer><div class="gel-menu" data-menu hidden><button data-action="close">继续游戏</button><button data-action="back">返回上一句</button><button data-action="quit">退出</button></div>`;
    this.elements.scene = root.querySelector("[data-scene]") as HTMLElement;
    for (const button of root.querySelectorAll<HTMLButtonElement>("button[data-action]")) button.onclick = () => this.action(button.dataset.action!);
    root.tabIndex = 0;
    root.onclick = event => {
      if ((event.target as HTMLElement).tagName !== "CANVAS") return;
      const canvas = event.target as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const index = this.stage.hitTestChoice(event.clientX - rect.left, event.clientY - rect.top);
      if (index !== null) {
        this.session.selectChoice(index);
        this.confirm();
      } else if (this.session.getChoices() === null) {
        // 有选项时必须选择；无选项时点击任意处继续。
        this.confirm();
      }
    };
    root.onmousemove = event => {
      if ((event.target as HTMLElement).tagName !== "CANVAS") return;
      const canvas = event.target as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const index = this.stage.hitTestChoice(event.clientX - rect.left, event.clientY - rect.top);
      canvas.style.cursor = index !== null ? "pointer" : "default";
      // Hovering a choice highlights it, matching keyboard selection.
      if (index !== null && index !== this.session.getChoices()?.selectedIndex) {
        this.session.selectChoice(index);
        void this.render();
      }
    };
    root.onkeydown = event => {
      if (["Enter", " "].includes(event.key)) { event.preventDefault(); this.confirm(); }
      if (event.key === "ArrowUp") { this.session.moveChoice(-1); void this.render(); }
      if (event.key === "ArrowDown") { this.session.moveChoice(1); void this.render(); }
    };
  }

  private action(action: string): void { const menu = this.options.root.querySelector("[data-menu]") as HTMLElement; if (action === "menu") menu.hidden = false; else if (action === "close") menu.hidden = true; else if (action === "back") { this.session.goBack(); void this.render(); } else if (action === "quit") this.destroy(); else if (action === "auto") this.options.root.classList.toggle("is-auto"); else if (action === "save") localStorage.setItem("gel:last-view", JSON.stringify(this.session.snapshot())); }
  private confirm(): void { const pending = this.pending; if (!pending) return; const value = pending.request.type === "choice" ? this.session.getSelectedChoice() : undefined; if (pending.request.type === "choice" && value === null) return; this.pending = null; pending.resolve(value); }

  private async render(): Promise<void> {
    const dialogue = this.session.getDialogue();
    const choices = this.session.getChoices();
    this.elements.scene.textContent = this.session.getSceneId().toUpperCase();
    await this.stage.render(this.session.snapshot().stage, dialogue, choices);
  }
}
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!); }
