export interface WebGLTextOptions {
  readonly font?: string;
  readonly fontSize?: number;
  readonly color?: string;
  readonly strokeColor?: string;
  readonly strokeWidth?: number;
  readonly align?: "left" | "center" | "right";
  readonly baseline?: "top" | "middle" | "bottom";
  readonly maxWidth?: number;
  readonly lineHeight?: number;
  readonly padding?: number;
  readonly fontPath?: string;
}

export interface WebGLTextSprite {
  readonly text: string;
  readonly options: WebGLTextOptions;
}

export class WebGLTextRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly fontCache = new Map<string, string>();

  public constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d")!;
  }
  
  private async loadFont(fontPath: string, fontName: string): Promise<boolean> {
    if (this.fontCache.has(fontName)) return true;
    
    try {
      const fontFace = new FontFace(fontName, `url(${fontPath})`);
      await fontFace.load();
      document.fonts.add(fontFace);
      this.fontCache.set(fontName, fontPath);
      return true;
    } catch (error) {
      console.warn(`Failed to load font ${fontName} from ${fontPath}:`, error);
      return false;
    }
  }

  public async renderText(text: string, options: WebGLTextOptions = {}): Promise<{ width: number; height: number; data: ImageData } | null> {
    const {
      font = '"Noto Serif JP", serif',
      fontSize = 24,
      color = "#ffffff",
      strokeColor = "#000000",
      strokeWidth = 2,
      align = "left",
      baseline = "top",
      maxWidth = 800,
      lineHeight = 1.6,
      padding = 8,
      fontPath,
    } = options;
    
    // Load custom font if specified
    if (fontPath) {
      const fontName = font.split(',')[0].replace(/['"]/g, '').trim();
      const loaded = await this.loadFont(fontPath, fontName);
      if (!loaded) {
        console.warn(`Using fallback font for ${fontName}`);
      }
    }

    this.ctx.font = `${fontSize}px ${font}`;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = baseline;

    // Measure text
    const lines = this.wrapText(text, maxWidth);
    const lineHeightPx = fontSize * lineHeight;
    const width = Math.min(maxWidth, Math.max(...lines.map(line => this.ctx.measureText(line).width))) + padding * 2;
    const height = lines.length * lineHeightPx + padding * 2;

    // Resize canvas
    this.canvas.width = Math.ceil(width);
    this.canvas.height = Math.ceil(height);

    // Clear and redraw
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.font = `${fontSize}px ${font}`;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = baseline;

    // Draw stroke
    if (strokeWidth > 0) {
      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = strokeWidth * 2;
      this.ctx.lineJoin = "round";
      lines.forEach((line, index) => {
        const y = padding + index * lineHeightPx + (baseline === "middle" ? lineHeightPx / 2 : 0);
        const x = padding + (align === "center" ? (width - padding * 2) / 2 : align === "right" ? width - padding * 2 : 0);
        this.ctx.strokeText(line, x, y);
      });
    }

    // Draw fill
    this.ctx.fillStyle = color;
    lines.forEach((line, index) => {
      const y = padding + index * lineHeightPx + (baseline === "middle" ? lineHeightPx / 2 : 0);
      const x = padding + (align === "center" ? (width - padding * 2) / 2 : align === "right" ? width - padding * 2 : 0);
      this.ctx.fillText(line, x, y);
    });

    return {
      width,
      height,
      data: this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height),
    };
  }

  private wrapText(text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    const words = text.split("");
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine + word;
      const metrics = this.ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine !== "") {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine !== "") {
      lines.push(currentLine);
    }
    return lines;
  }
}
