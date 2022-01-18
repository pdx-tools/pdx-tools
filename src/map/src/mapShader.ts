import { GLResources } from "./glResources";
import { notNull } from "./nullcheck";

export class MapShader {
  private constructor(
    private gl: WebGL2RenderingContext,
    private program: WebGLProgram,
    private aPos: GLuint,
    private aTexCoord: GLuint,
    private uProvinceCount: WebGLUniformLocation,
    private uRenderProvinceBorders: WebGLUniformLocation,
    private uRenderMapmodeBorders: WebGLUniformLocation,
    private uRenderCountryBorders: WebGLUniformLocation,
    private uTerrain: WebGLUniformLocation,
    private uRivers: WebGLUniformLocation,
    private uProvinces: WebGLUniformLocation,
    private uStripes: WebGLUniformLocation,
    private uProvincesUniqueColors: WebGLUniformLocation,
    private uCountryProvinceColor: WebGLUniformLocation,
    private uPrimaryProvinceColor: WebGLUniformLocation,
    private uSecondaryProvinceColor: WebGLUniformLocation,
    private uTextureSize: WebGLUniformLocation
  ) {}

  static create(gl: WebGL2RenderingContext, program: WebGLProgram) {
    return new MapShader(
      gl,
      program,
      gl.getAttribLocation(program, "a_position"),
      gl.getAttribLocation(program, "a_texCoord"),
      notNull(gl.getUniformLocation(program, "u_provinceCount")),
      notNull(gl.getUniformLocation(program, "u_renderProvinceBorders")),
      notNull(gl.getUniformLocation(program, "u_renderMapmodeBorders")),
      notNull(gl.getUniformLocation(program, "u_renderCountryBorders")),
      notNull(gl.getUniformLocation(program, "u_terrainImage")),
      notNull(gl.getUniformLocation(program, "u_riversImage")),
      notNull(gl.getUniformLocation(program, "u_provincesImage")),
      notNull(gl.getUniformLocation(program, "u_stripesImage")),
      notNull(gl.getUniformLocation(program, "u_provincesUniqueColorsImage")),
      notNull(gl.getUniformLocation(program, "u_countryProvincesColorImage")),
      notNull(gl.getUniformLocation(program, "u_primaryProvincesColorImage")),
      notNull(gl.getUniformLocation(program, "u_secondaryProvincesColorImage")),
      notNull(gl.getUniformLocation(program, "u_textureSize"))
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
    gl.bindTexture(gl.TEXTURE_2D, res.terrain);
    gl.uniform1i(this.uTerrain, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, res.rivers);
    gl.uniform1i(this.uRivers, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, res.provinces);
    gl.uniform1i(this.uProvinces, 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, res.stripes);
    gl.uniform1i(this.uStripes, 3);

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, res.provincesUniqueColor);
    gl.uniform1i(this.uProvincesUniqueColors, 4);

    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, res.countryProvinceColors);
    gl.uniform1i(this.uCountryProvinceColor, 5);

    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, res.primaryProvinceColors);
    gl.uniform1i(this.uPrimaryProvinceColor, 6);

    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, res.secondaryProvinceColors);
    gl.uniform1i(this.uSecondaryProvinceColor, 7);
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
