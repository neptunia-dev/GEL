export interface WebGLRendererOptions {
  readonly canvas: HTMLCanvasElement;
  readonly antialias?: boolean;
  readonly clearColor?: readonly [number, number, number, number];
}

export interface WebGLSprite {
  readonly id: string;
  readonly texture: WebGLTexture;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly opacity?: number;
  readonly zIndex?: number;
}

/** Minimal 2D sprite renderer built on WebGL2, suitable for the GEL stage. */
export class WebGLRenderer {
  public readonly canvas: HTMLCanvasElement;
  public readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly positionBuffer: WebGLBuffer;
  private readonly positionLocation: number;
  private readonly uvLocation: number;
  private readonly projectionLocation: WebGLUniformLocation;
  private readonly textureLocation: WebGLUniformLocation;
  private readonly opacityLocation: WebGLUniformLocation;
  private clearColor: readonly [number, number, number, number];

  public constructor(options: WebGLRendererOptions) {
    this.canvas = options.canvas;
    const gl = options.canvas.getContext("webgl2", { antialias: options.antialias ?? true });
    if (!gl) throw new Error("WebGL2 is not supported by this browser");
    this.gl = gl;
    this.clearColor = options.clearColor ?? [0.035, 0.035, 0.055, 1];
    this.program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.positionBuffer = gl.createBuffer() ?? fail("Unable to create WebGL position buffer");
    this.positionLocation = gl.getAttribLocation(this.program, "a_position");
    this.uvLocation = gl.getAttribLocation(this.program, "a_uv");
    this.projectionLocation = getUniform(gl, this.program, "u_projection");
    this.textureLocation = getUniform(gl, this.program, "u_texture");
    this.opacityLocation = getUniform(gl, this.program, "u_opacity");
    this.resize();
  }

  public setClearColor(color: readonly [number, number, number, number]): void { this.clearColor = color; }

  public resize(): void {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    this.gl.viewport(0, 0, width, height);
  }

  public render(sprites: readonly WebGLSprite[] = []): void {
    const gl = this.gl;
    this.resize();
    gl.clearColor(...this.clearColor);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.enableVertexAttribArray(this.uvLocation);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(this.uvLocation, 2, gl.FLOAT, false, 16, 8);
    gl.uniformMatrix3fv(this.projectionLocation, false, projection(this.canvas.width, this.canvas.height));
    gl.uniform1i(this.textureLocation, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const sprite of [...sprites].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))) {
      const x2 = sprite.x + sprite.width; const y2 = sprite.y + sprite.height;
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([sprite.x, sprite.y, 0, 0, x2, sprite.y, 1, 0, sprite.x, y2, 0, 1, x2, y2, 1, 1]), gl.STREAM_DRAW);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sprite.texture);
      gl.uniform1f(this.opacityLocation, sprite.opacity ?? 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  public dispose(): void { this.gl.deleteBuffer(this.positionBuffer); this.gl.deleteProgram(this.program); }
}

function projection(width: number, height: number): Float32Array { return new Float32Array([2 / width, 0, 0, 0, -2 / height, 0, -1, 1, 1]); }
function getUniform(gl: WebGL2RenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation { return gl.getUniformLocation(program, name) ?? fail(`Missing uniform ${name}`); }
function fail(message: string): never { throw new Error(message); }
function createProgram(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram { const compile = (type: number, source: string) => { const shader = gl.createShader(type) ?? fail("Unable to create shader"); gl.shaderSource(shader, source); gl.compileShader(shader); if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) fail(gl.getShaderInfoLog(shader) ?? "Shader compilation failed"); return shader; }; const program = gl.createProgram() ?? fail("Unable to create program"); gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment)); gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) fail(gl.getProgramInfoLog(program) ?? "Program linking failed"); return program; }

const VERTEX_SHADER = `#version 300 es
in vec2 a_position; in vec2 a_uv; uniform mat3 u_projection; out vec2 v_uv;
void main(){ vec3 p=u_projection*vec3(a_position,1.0); gl_Position=vec4(p.xy,0.0,1.0); v_uv=a_uv; }`;
const FRAGMENT_SHADER = `#version 300 es
precision mediump float; uniform sampler2D u_texture; uniform float u_opacity; in vec2 v_uv; out vec4 outColor;
void main(){ vec4 color=texture(u_texture,v_uv); outColor=vec4(color.rgb,color.a*u_opacity); }`;
