import { GLResources } from "./glResources";
import { notNull } from "./nullcheck";

export class XbrShader {
  private constructor(
    private gl: WebGL2RenderingContext,
    private program: WebGLProgram,
    private uFocusPoint: WebGLUniformLocation | null,
    private uResolution: WebGLUniformLocation | null,
    private uScale: WebGLUniformLocation | null,
    private uMaxScale: WebGLUniformLocation | null,
    private uTextureSize: WebGLUniformLocation | null,
    private uUsedTextureSize: WebGLUniformLocation | null,
    private uFlipY: WebGLUniformLocation | null,
    private uRenderTerrain: WebGLUniformLocation | null,
    private aPos: GLuint,
    private aTexCoord: GLuint,
    private uRawMapEdgesTexture1: WebGLUniformLocation | null,
    private uRawMapEdgesTexture2: WebGLUniformLocation | null,
    private uRawMapTexture1: WebGLUniformLocation | null,
    private uRawMapTexture2: WebGLUniformLocation | null,
    private uNormal: WebGLUniformLocation | null,
    private uWater: WebGLUniformLocation | null,
    private uColormap: WebGLUniformLocation | null,
    private uHeightMap: WebGLUniformLocation | null,
    private uSea: WebGLUniformLocation | null,
    private uSurfaceRock: WebGLUniformLocation | null,
    private uSurfaceGreen: WebGLUniformLocation | null,
    private uSurfaceNormalRock: WebGLUniformLocation | null,
    private uSurfaceNormalGreen: WebGLUniformLocation | null,
  ) {}

  static create(gl: WebGL2RenderingContext, program: WebGLProgram) {
    return new XbrShader(
      gl,
      program,
      gl.getUniformLocation(program, "u_focusPoint"),
      gl.getUniformLocation(program, "u_resolution"),
      gl.getUniformLocation(program, "u_scale"),
      gl.getUniformLocation(program, "u_maxScale"),
      gl.getUniformLocation(program, "u_textureSize"),
      gl.getUniformLocation(program, "u_usedTextureSize"),
      gl.getUniformLocation(program, "u_flipY"),
      gl.getUniformLocation(program, "u_renderTerrain"),
      notNull(gl.getAttribLocation(program, "a_position")),
      notNull(gl.getAttribLocation(program, "a_texCoord")),
      gl.getUniformLocation(program, "u_mapEdgesTexture1"),
      gl.getUniformLocation(program, "u_mapEdgesTexture2"),
      gl.getUniformLocation(program, "u_mapTexture1"),
      gl.getUniformLocation(program, "u_mapTexture2"),
      gl.getUniformLocation(program, "u_normalImage"),
      gl.getUniformLocation(program, "u_waterImage"),
      gl.getUniformLocation(program, "u_colormapImage"),
      gl.getUniformLocation(program, "u_heightMapImage"),
      gl.getUniformLocation(program, "u_seaImage"),
      gl.getUniformLocation(program, "u_surfaceRockImage"),
      gl.getUniformLocation(program, "u_surfaceGreenImage"),
      gl.getUniformLocation(program, "u_surfaceNormalRockImage"),
      gl.getUniformLocation(program, "u_surfaceNormalGreenImage"),
    );
  }

  clear() {
    this.gl.useProgram(null);
  }

  use() {
    this.gl.useProgram(this.program);
  }

  setTextures(res: GLResources) {
    let gl = this.gl;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, res.framebufferRawMapEdgesTexture1);
    gl.uniform1i(this.uRawMapEdgesTexture1, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, res.framebufferRawMapTexture1);
    gl.uniform1i(this.uRawMapTexture1, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, res.normal);
    gl.uniform1i(this.uNormal, 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, res.water);
    gl.uniform1i(this.uWater, 3);

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, res.colorMap);
    gl.uniform1i(this.uColormap, 4);

    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, res.heightMap);
    gl.uniform1i(this.uHeightMap, 7);

    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, res.sea);
    gl.uniform1i(this.uSea, 8);

    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_2D, res.surfaceRock);
    gl.uniform1i(this.uSurfaceRock, 9);

    gl.activeTexture(gl.TEXTURE10);
    gl.bindTexture(gl.TEXTURE_2D, res.surfaceGreen);
    gl.uniform1i(this.uSurfaceGreen, 10);

    gl.activeTexture(gl.TEXTURE11);
    gl.bindTexture(gl.TEXTURE_2D, res.surfaceNormalRock);
    gl.uniform1i(this.uSurfaceNormalRock, 11);

    gl.activeTexture(gl.TEXTURE12);
    gl.bindTexture(gl.TEXTURE_2D, res.surfaceNormalGreen);
    gl.uniform1i(this.uSurfaceNormalGreen, 12);

    gl.activeTexture(gl.TEXTURE13);
    gl.bindTexture(gl.TEXTURE_2D, res.framebufferRawMapEdgesTexture2);
    gl.uniform1i(this.uRawMapEdgesTexture2, 13);

    gl.activeTexture(gl.TEXTURE14);
    gl.bindTexture(gl.TEXTURE_2D, res.framebufferRawMapTexture2);
    gl.uniform1i(this.uRawMapTexture2, 14);
  }

  setScale(scale: number) {
    this.gl.uniform1f(this.uScale, scale);
  }

  setMaxScale(scale: number) {
    this.gl.uniform1f(this.uMaxScale, scale);
  }

  setRenderTerrain(render: boolean) {
    this.gl.uniform1i(this.uRenderTerrain, render ? 1 : 0);
  }

  setFlipY(flip: boolean) {
    this.gl.uniform1i(this.uFlipY, flip ? 1 : 0);
  }

  setFocusPoint(focusPoint: [number, number]) {
    this.gl.uniform2fv(this.uFocusPoint, focusPoint);
  }

  setResolution(width: number, height: number) {
    this.gl.uniform2f(this.uResolution, width, height);
  }

  setUsedTextureSize(width: number, height: number) {
    this.gl.uniform2f(this.uUsedTextureSize, width, height);
  }

  setTextureSize(width: number, height: number) {
    this.gl.uniform2f(this.uTextureSize, width, height);
  }

  private setVertexAttribPointer(location: GLint, buffer: WebGLBuffer | null) {
    const gl = this.gl;

    gl.enableVertexAttribArray(location);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    var size = 2;
    var type = gl.FLOAT;
    var normalize = false;
    var stride = 0;
    var offset = 0;
    gl.vertexAttribPointer(location, size, type, normalize, stride, offset);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  bindPosBuffer(buffer: WebGLBuffer | null) {
    this.setVertexAttribPointer(this.aPos, buffer);
  }

  bindTexCoordBuffer(buffer: WebGLBuffer | null) {
    this.setVertexAttribPointer(this.aTexCoord, buffer);
  }
}
