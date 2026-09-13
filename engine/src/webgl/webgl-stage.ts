import type { TuiStageSnapshot, TuiDialogueState, TuiChoiceState } from "../tui";
import { WebGLRenderer, type WebGLSprite } from "./webgl-renderer";
import { WebGLTextureManager } from "./webgl-texture-manager";
import { WebGLTextRenderer, type WebGLTextOptions } from "./webgl-text";

export interface WebGLStageOptions { readonly canvas: HTMLCanvasElement; readonly background?: string; }

interface ChoiceRegion { readonly index: number; readonly x: number; readonly y: number; readonly width: number; readonly height: number; }

const FONT_PATH = "./assets/fonts/NotoSerifJP.ttf";
const FONT_FAMILY = '"Noto Serif JP", serif';

/** Maps the engine's logical two-slot stage to WebGL sprites. */
export class WebGLStage {
  public readonly renderer: WebGLRenderer;
  public readonly textures: WebGLTextureManager;
  private background: WebGLTexture | undefined;
  private readonly characterTextures = new Map<string, WebGLTexture>();
  private readonly textRenderer = new WebGLTextRenderer();
  private readonly textTextures = new Map<string, WebGLTexture>();
  private choiceRegions: ChoiceRegion[] = [];

  public constructor(options: WebGLStageOptions) {
    this.renderer = new WebGLRenderer({ canvas: options.canvas });
    this.textures = new WebGLTextureManager(this.renderer.gl);
  }

  public async setBackground(id: string, url: string): Promise<void> { this.background = await this.textures.load(id, url); }
  public async setCharacterTexture(characterId: string, url: string): Promise<void> { this.characterTextures.set(characterId, await this.textures.load(`character:${characterId}`, url)); }

  /** Hit-test a point (CSS pixels relative to canvas) against the last rendered choice regions. */
  public hitTestChoice(cssX: number, cssY: number): number | null {
    const canvas = this.renderer.canvas;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = cssX * (canvas.width / rect.width);
    const y = cssY * (canvas.height / rect.height);
    for (const region of this.choiceRegions) {
      if (x >= region.x && x <= region.x + region.width && y >= region.y && y <= region.y + region.height) return region.index;
    }
    return null;
  }

  public async render(snapshot: TuiStageSnapshot, dialogue?: TuiDialogueState | null, choices?: TuiChoiceState | null): Promise<void> {
    this.renderer.resize();
    const width = this.renderer.canvas.width; const height = this.renderer.canvas.height;
    const sprites: WebGLSprite[] = [];
    if (this.background) sprites.push({ id: "background", texture: this.background, x: 0, y: 0, width, height, zIndex: 0 });
    for (const [index, slot] of [snapshot.left, snapshot.right].entries()) {
      if (!slot) continue;
      const texture = this.characterTextures.get(slot.characterId); if (!texture) continue;
      const characterHeight = height * 0.92;
      const characterWidth = characterHeight * (2 / 3);
      const x = index === 0 ? width * 0.12 : width * 0.62;
      sprites.push({ id: slot.characterId, texture, x, y: height * 0.04, width: characterWidth, height: characterHeight, opacity: slot.focused ? 1 : 0.68, zIndex: 1 });
    }

    const dialogueY = height * 0.74;
    const dialogueHeight = height * 0.20;

    // Choices: rendered above the dialogue box, centered.
    const newRegions: ChoiceRegion[] = [];
    if (choices && choices.options.length > 0) {
      const choiceWidth = width * 0.44;
      const choiceX = (width - choiceWidth) / 2;
      const gap = height * 0.016;
      const items: { enabled: boolean; selected: boolean; text: { texture: WebGLTexture; width: number; height: number } | null }[] = [];
      for (const [i, option] of choices.options.entries()) {
        const selected = i === choices.selectedIndex;
        const enabled = option.enabled !== false;
        const text = await this.createTextTexture(`choice-${i}`, option.text, {
          font: FONT_FAMILY, fontSize: Math.round(height * 0.032),
          color: enabled ? (selected ? "#ffe7cf" : "#f3e6e1") : "#8a8494",
          strokeColor: "#1a0f1d", strokeWidth: 3,
          align: "center", maxWidth: choiceWidth - 60, padding: 6, fontPath: FONT_PATH,
        });
        items.push({ enabled, selected, text });
      }
      const boxHeights = items.map(item => Math.max((item.text?.height ?? 24) + height * 0.02, height * 0.052));
      const totalHeight = boxHeights.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
      let y = dialogueY - height * 0.025 - totalHeight;
      items.forEach((item, i) => {
        const boxHeight = boxHeights[i];
        const boxTexture = this.createChoiceBoxTexture(choiceWidth, boxHeight, item.selected, item.enabled);
        sprites.push({ id: `choice-box-${i}`, texture: boxTexture, x: choiceX, y, width: choiceWidth, height: boxHeight, zIndex: 4, opacity: item.enabled ? 1 : 0.55 });
        if (item.text) {
          const textX = choiceX + (choiceWidth - item.text.width) / 2;
          const textY = y + (boxHeight - item.text.height) / 2;
          sprites.push({ id: `choice-text-${i}`, texture: item.text.texture, x: textX, y: textY, width: item.text.width, height: item.text.height, zIndex: 5, opacity: item.enabled ? 1 : 0.5 });
        }
        newRegions.push({ index: i, x: choiceX, y, width: choiceWidth, height: boxHeight });
        y += boxHeight + gap;
      });
    }

    // Dialogue box
    if (dialogue) {
      const dialogueWidth = width * 0.80;
      const dialogueX = (width - dialogueWidth) / 2;

      if (dialogue.speakerName) {
        const speakerText = await this.createTextTexture(`speaker-${dialogue.speakerId || "none"}`, dialogue.speakerName, {
          font: FONT_FAMILY, fontSize: Math.round(height * 0.038),
          color: "#f1c18d", strokeColor: "#251827", strokeWidth: 4,
          maxWidth: dialogueWidth - 40, padding: 10, fontPath: FONT_PATH,
        });
        if (speakerText) {
          const speakerX = dialogueX + 20;
          const speakerY = dialogueY - speakerText.height + 12;
          sprites.push({ id: "speaker", texture: speakerText.texture, x: speakerX, y: speakerY, width: speakerText.width, height: speakerText.height, zIndex: 3 });
        }
      }

      const dialogueText = await this.createTextTexture("dialogue", dialogue.text, {
        font: FONT_FAMILY, fontSize: Math.round(height * 0.034),
        color: "#fff9f5", strokeColor: "#1a0f1d", strokeWidth: 4,
        maxWidth: dialogueWidth - 40, lineHeight: 1.7, padding: 12, fontPath: FONT_PATH,
      });
      if (dialogueText) {
        const textX = dialogueX + 20;
        const textY = dialogueY + 24;
        sprites.push({ id: "dialogue-text", texture: dialogueText.texture, x: textX, y: textY, width: dialogueText.width, height: dialogueText.height, zIndex: 3 });
      }

      sprites.push({ id: "dialogue-box", texture: this.createDialogueBoxTexture(dialogueWidth, dialogueHeight), x: dialogueX, y: dialogueY, width: dialogueWidth, height: dialogueHeight, zIndex: 2, opacity: 0.95 });
    }

    this.choiceRegions = newRegions;
    this.renderer.render(sprites);
  }

  private async createTextTexture(id: string, text: string, options: WebGLTextOptions): Promise<{ texture: WebGLTexture; width: number; height: number } | null> {
    const result = await this.textRenderer.renderText(text, options);
    if (!result) return null;
    const gl = this.renderer.gl;
    const existing = this.textTextures.get(id);
    if (existing) gl.deleteTexture(existing);
    const texture = gl.createTexture();
    if (!texture) return null;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, result.data);
    this.textTextures.set(id, texture);
    return { texture, width: result.width, height: result.height };
  }

  private uploadCanvas(canvas: HTMLCanvasElement): WebGLTexture {
    const gl = this.renderer.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    return texture;
  }

  private createDialogueBoxTexture(width: number, height: number): WebGLTexture {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(width)); canvas.height = Math.max(1, Math.ceil(height));
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "rgba(37, 21, 39, 0.95)");
    gradient.addColorStop(0.5, "rgba(23, 20, 36, 0.95)");
    gradient.addColorStop(1, "rgba(45, 23, 40, 0.95)");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(240, 185, 143, 0.3)"; ctx.lineWidth = 1; ctx.strokeRect(0, 0, width, height);
    return this.uploadCanvas(canvas);
  }

  private createChoiceBoxTexture(width: number, height: number, selected: boolean, enabled: boolean): WebGLTexture {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(width)); canvas.height = Math.max(1, Math.ceil(height));
    const ctx = canvas.getContext("2d")!;
    const radius = Math.min(8, height / 4);
    ctx.beginPath(); ctx.roundRect(1, 1, width - 2, height - 2, radius);
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    if (selected) { gradient.addColorStop(0, "rgba(96, 51, 76, 0.92)"); gradient.addColorStop(1, "rgba(39, 27, 53, 0.92)"); }
    else { gradient.addColorStop(0, "rgba(38, 23, 41, 0.85)"); gradient.addColorStop(1, "rgba(21, 18, 33, 0.85)"); }
    ctx.fillStyle = gradient; ctx.fill();
    ctx.strokeStyle = selected ? "rgba(240, 185, 143, 0.85)" : "rgba(240, 185, 143, 0.25)";
    ctx.lineWidth = selected ? 2 : 1; ctx.stroke();
    if (selected) { ctx.fillStyle = "rgba(240, 185, 143, 0.9)"; ctx.beginPath(); ctx.arc(16, height / 2, 3, 0, Math.PI * 2); ctx.fill(); }
    return this.uploadCanvas(canvas);
  }

  public dispose(): void { this.textures.dispose(); this.renderer.dispose(); }
}
