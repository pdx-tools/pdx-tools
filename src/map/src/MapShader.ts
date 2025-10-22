import type { GLResources } from "./glResources";

export class MapShader {
  private constructor(
    private gl: WebGL2RenderingContext,
    private program: WebGLProgram,
    private aPos: GLuint,
    private aTexCoord: GLuint,
    private uProvinceCount: WebGLUniformLocation | null,
    private uRenderProvinceBorders: WebGLUniformLocation | null,
    private uRenderMapmodeBorders: WebGLUniformLocation | null,
    private uRenderCountryBorders: WebGLUniformLocation | null,
    private uTerrain1: WebGLUniformLocation | null,
    private uTerrain2: WebGLUniformLocation | null,
    private uRivers1: WebGLUniformLocation | null,
    private uRivers2: WebGLUniformLocation | null,
    private uProvinces1: WebGLUniformLocation | null,
    private uProvinces2: WebGLUniformLocation | null,
    private uStripes: WebGLUniformLocation | null,
    private uProvincesUniqueColors: WebGLUniformLocation | null,
    private uCountryProvinceColor: WebGLUniformLocation | null,
    private uPrimaryProvinceColor: WebGLUniformLocation | null,
    private uSecondaryProvinceColor: WebGLUniformLocation | null,
    private uTextureSize: WebGLUniformLocation | null,
  ) {}

  static create(gl: WebGL2RenderingContext, program: WebGLProgram) {
    return new MapShader(
      gl,
      program,
      gl.getAttribLocation(program, "a_position"),
      gl.getAttribLocation(program, "a_texCoord"),
      gl.getUniformLocation(program, "u_provinceCount"),
      gl.getUniformLocation(program, "u_renderProvinceBorders"),
      gl.getUniformLocation(program, "u_renderMapmodeBorders"),
      gl.getUniformLocation(program, "u_renderCountryBorders"),
      gl.getUniformLocation(program, "u_terrainImage1"),
      gl.getUniformLocation(program, "u_terrainImage2"),
      gl.getUniformLocation(program, "u_riversImage1"),
      gl.getUniformLocation(program, "u_riversImage2"),
      gl.getUniformLocation(program, "u_provincesImage1"),
      gl.getUniformLocation(program, "u_provincesImage2"),
      gl.getUniformLocation(program, "u_stripesImage"),
      gl.getUniformLocation(program, "u_provincesUniqueColorsImage"),
      gl.getUniformLocation(program, "u_countryProvincesColorImage"),
      gl.getUniformLocation(program, "u_primaryProvincesColorImage"),
      gl.getUniformLocation(program, "u_secondaryProvincesColorImage"),
      gl.getUniformLocation(program, "u_textureSize"),
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
    gl.bindTexture(gl.TEXTURE_2D, res.terrain1);
    gl.uniform1i(this.uTerrain1, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, res.terrain2);
    gl.uniform1i(this.uTerrain2, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, res.rivers1);
    gl.uniform1i(this.uRivers1, 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, res.rivers2);
    gl.uniform1i(this.uRivers2, 3);

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, res.provinces1);
    gl.uniform1i(this.uProvinces1, 4);

    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, res.provinces2);
    gl.uniform1i(this.uProvinces2, 5);

    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, res.stripes);
    gl.uniform1i(this.uStripes, 6);

    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, res.provincesUniqueColor);
    gl.uniform1i(this.uProvincesUniqueColors, 7);

    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, res.countryProvinceColors);
    gl.uniform1i(this.uCountryProvinceColor, 8);

    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_2D, res.primaryProvinceColors);
    gl.uniform1i(this.uPrimaryProvinceColor, 9);

    gl.activeTexture(gl.TEXTURE10);
    gl.bindTexture(gl.TEXTURE_2D, res.secondaryProvinceColors);
    gl.uniform1i(this.uSecondaryProvinceColor, 10);
  }

  setProvinceCount(count: number) {
    this.gl.uniform1ui(this.uProvinceCount, count);
  }

  setTextureSize(width: number, height: number) {
    this.gl.uniform2f(this.uTextureSize, width, height);
  }

  setRenderCountryBorders(rpv: boolean) {
    this.gl.uniform1i(this.uRenderCountryBorders, rpv ? 1 : 0);
  }

  setRenderProvinceBorders(rpv: boolean) {
    this.gl.uniform1i(this.uRenderProvinceBorders, rpv ? 1 : 0);
  }

  setRenderMapmodeBorders(rpv: boolean) {
    this.gl.uniform1i(this.uRenderMapmodeBorders, rpv ? 1 : 0);
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
