export interface TextureSource { readonly id: string; readonly source: TexImageSource; readonly premultiplyAlpha?: boolean; }

/** Owns WebGL textures and uploads browser image sources with safe defaults. */
export class WebGLTextureManager {
  private readonly textures = new Map<string, WebGLTexture>();
  public constructor(private readonly gl: WebGL2RenderingContext) {}

  public async load(id: string, url: string): Promise<WebGLTexture> {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return this.upload({ id, source: image });
  }

  public upload(source: TextureSource): WebGLTexture {
    const existing = this.textures.get(source.id);
    if (existing) this.gl.deleteTexture(existing);
    const texture = this.gl.createTexture();
    if (!texture) throw new Error(`Unable to create texture '${source.id}'`);
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // UV coordinates already use the browser image's top-left origin.
    // Flipping here would invert character sprites vertically.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, source.premultiplyAlpha === false ? 0 : 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source.source);
    this.textures.set(source.id, texture);
    return texture;
  }

  public get(id: string): WebGLTexture | undefined { return this.textures.get(id); }
  public delete(id: string): void { const texture = this.textures.get(id); if (texture) { this.gl.deleteTexture(texture); this.textures.delete(id); } }
  public dispose(): void { for (const texture of this.textures.values()) this.gl.deleteTexture(texture); this.textures.clear(); }
}
