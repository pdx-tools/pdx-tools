import { GLResources } from "./glResources";
import { notNull } from "./nullcheck";

export class XbrShader {
  private constructor(
    private gl: WebGL2RenderingContext,
    private program: WebGLProgram,
    private uFocusPoint: WebGLUniformLocation,
    private uResolution: WebGLUniformLocation,
    private uScale: WebGLUniformLocation,
    private uMaxScale: WebGLUniformLocation,
    private uTextureSize: WebGLUniformLocation,
    private uUsedTextureSize: WebGLUniformLocation,
    private uFlipY: WebGLUniformLocation,
    private uRenderTerrain: WebGLUniformLocation,
    private aPos: GLuint,
    private aTexCoord: GLuint,
    private uMapEdgesTexture: WebGLUniformLocation,
    private uMapTexture: WebGLUniformLocation,
    private uNormal: WebGLUniformLocation,
    private uWater: WebGLUniformLocation,
    private uColormap: WebGLUniformLocation,
    private uHeightMap: WebGLUniformLocation,
    private uSea: WebGLUniformLocation,
    private uSurfaceRock: WebGLUniformLocation,
    private uSurfaceGreen: WebGLUniformLocation,
    private uSurfaceNormalRock: WebGLUniformLocation,
    private uSurfaceNormalGreen: WebGLUniformLocation
  ) {}

  static create(gl: WebGL2RenderingContext, program: WebGLProgram) {
    return new XbrShader(
      gl,
      program,
      notNull(gl.getUniformLocation(program, "u_focusPoint")),
      notNull(gl.getUniformLocation(program, "u_resolution")),
      notNull(gl.getUniformLocation(program, "u_scale")),
      notNull(gl.getUniformLocation(program, "u_maxScale")),
      notNull(gl.getUniformLocation(program, "u_textureSize")),
      notNull(gl.getUniformLocation(program, "u_usedTextureSize")),
      notNull(gl.getUniformLocation(program, "u_flipY")),
      notNull(gl.getUniformLocation(program, "u_renderTerrain")),
      notNull(gl.getAttribLocation(program, "a_position")),
      notNull(gl.getAttribLocation(program, "a_texCoord")),
      notNull(gl.getUniformLocation(program, "u_mapEdgesTexture")),
      notNull(gl.getUniformLocation(program, "u_mapTexture")),
      notNull(gl.getUniformLocation(program, "u_normalImage")),
      notNull(gl.getUniformLocation(program, "u_waterImage")),
      notNull(gl.getUniformLocation(program, "u_colormapImage")),
      notNull(gl.getUniformLocation(program, "u_heightMapImage")),
      notNull(gl.getUniformLocation(program, "u_seaImage")),
      notNull(gl.getUniformLocation(program, "u_surfaceRockImage")),
      notNull(gl.getUniformLocation(program, "u_surfaceGreenImage")),
      notNull(gl.getUniformLocation(program, "u_surfaceNormalRockImage")),
      notNull(gl.getUniformLocation(program, "u_surfaceNormalGreenImage"))
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
    gl.bindTexture(gl.TEXTURE_2D, res.framebufferEdgesTexture);
    gl.uniform1i(this.uMapEdgesTexture, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, res.framebufferTexture);
    gl.uniform1i(this.uMapTexture, 1);

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
