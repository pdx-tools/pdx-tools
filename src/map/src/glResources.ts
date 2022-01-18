import { StaticResources } from "./staticResources";
import { MapShader } from "./mapShader";
import { XbrShader } from "./xbrShader";
import { IMG_WIDTH, IMG_HEIGHT, IMG_PADDED_WIDTH } from "./map";
import { notNull } from "./nullcheck";

// Stores all WebGL resource data like textures, shader programs, etc.
export class GLResources {
  private constructor(
    public readonly gl: WebGL2RenderingContext,
    public readonly colorMap: WebGLTexture,
    public readonly sea: WebGLTexture,
    public readonly normal: WebGLTexture,
    public readonly terrain: WebGLTexture,
    public readonly rivers: WebGLTexture,
    public readonly water: WebGLTexture,
    public readonly provinces: WebGLTexture,
    public readonly stripes: WebGLTexture,
    public readonly surfaceRock: WebGLTexture,
    public readonly surfaceGreen: WebGLTexture,
    public readonly surfaceNormalRock: WebGLTexture,
    public readonly surfaceNormalGreen: WebGLTexture,
    public readonly heightMap: WebGLTexture,
    public readonly provincesUniqueColor: WebGLTexture,
    public readonly countryProvinceColors: WebGLTexture,
    public readonly primaryProvinceColors: WebGLTexture,
    public readonly secondaryProvinceColors: WebGLTexture,
    public readonly mapShaderProgram: MapShader,
    public readonly xbrShaderProgram: XbrShader,
    public readonly posBuffer: WebGLBuffer,
    public readonly xbrPosBuffer: WebGLBuffer,
    public readonly texCoordBuffer: WebGLBuffer,
    public readonly xbrTexCoordBuffer: WebGLBuffer,
    public readonly geometryVao: WebGLVertexArrayObject,
    public readonly xbrVao: WebGLVertexArrayObject,
    public readonly framebufferEdgesTexture: WebGLTexture,
    public readonly framebufferTexture: WebGLTexture,
    public readonly framebuffer: WebGLFramebuffer,
    public readonly provinceCount: number
  ) {
    gl.bindVertexArray(geometryVao);
    mapShaderProgram.bindPosBuffer(posBuffer);
    mapShaderProgram.bindTexCoordBuffer(texCoordBuffer);
    gl.bindVertexArray(null);

    gl.bindVertexArray(xbrVao);
    xbrShaderProgram.bindPosBuffer(xbrPosBuffer);
    xbrShaderProgram.bindTexCoordBuffer(xbrTexCoordBuffer);
    gl.bindVertexArray(null);
  }

  static async create(
    gl: WebGL2RenderingContext,
    staticRes: StaticResources,
    linkedPrograms: () => Promise<WebGLProgram[]>,
    provincesCountryColor: Uint8Array
  ) {
    let provinceCount = staticRes.provincesUniqueColor.length / 3;

    let fb = notNull(gl.createFramebuffer());
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

    let fbEdgesTexture = notNull(gl.createTexture());
    setupFramebufferTexture(gl, fbEdgesTexture, IMG_PADDED_WIDTH, IMG_HEIGHT);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      fbEdgesTexture,
      0
    );

    let fbTexture = notNull(gl.createTexture());
    setupFramebufferTexture(gl, fbTexture, IMG_PADDED_WIDTH, IMG_HEIGHT);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT1,
      gl.TEXTURE_2D,
      fbTexture,
      0
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var xbrPositionBuffer = notNull(gl.createBuffer());
    resizeXbrGeometry(gl, xbrPositionBuffer, gl.canvas.width);

    const colorMap = setupTexture(gl, staticRes.colorMap, gl.LINEAR);
    const sea = setupTexture(gl, staticRes.sea, gl.LINEAR);
    const normal = setupTexture(gl, staticRes.normal, gl.LINEAR);
    const terrain = setupTexture(gl, staticRes.terrain, gl.NEAREST);
    const rivers = setupTexture(gl, staticRes.rivers, gl.NEAREST);
    const water = setupTexture(gl, staticRes.water, gl.LINEAR);
    const provinces = setupTexture(gl, staticRes.provinces, gl.NEAREST);
    const stripes = setupTexture(gl, staticRes.stripes, gl.NEAREST);
    const surfaceRock = setupTexture(gl, staticRes.surfaceRock, gl.LINEAR);
    const surfaceGreen = setupTexture(gl, staticRes.surfaceGreen, gl.LINEAR);
    const surfaceNormalRock = setupTexture(
      gl,
      staticRes.surfaceNormalRock,
      gl.LINEAR
    );
    const surfaceNormalGreen = setupTexture(
      gl,
      staticRes.surfaceNormalGreen,
      gl.LINEAR
    );
    const heightMap = setupTexture(gl, staticRes.heightMap, gl.LINEAR);

    const [mapProgram, xbrProgram] = await linkedPrograms();

    return new GLResources(
      gl,
      colorMap,
      sea,
      normal,
      terrain,
      rivers,
      water,
      provinces,
      stripes,
      surfaceRock,
      surfaceGreen,
      surfaceNormalRock,
      surfaceNormalGreen,
      heightMap,
      setupProvinceColorsTexture(
        gl,
        gl.RGB,
        provinceCount,
        staticRes.provincesUniqueColor
      ),
      setupProvinceColorsTexture(
        gl,
        gl.RGBA,
        provinceCount,
        provincesCountryColor
      ),
      setupProvinceCustomColorsTexture(
        gl,
        provinceCount,
        provincesCountryColor
      ),
      setupProvinceCustomColorsTexture(
        gl,
        provinceCount,
        provincesCountryColor
      ),
      MapShader.create(gl, mapProgram),
      XbrShader.create(gl, xbrProgram),
      initializeGeometry(gl),
      xbrPositionBuffer,
      initializeGeometryTexCoords(gl),
      initializeXbrTexCoords(gl),
      createVao(gl),
      createVao(gl),
      fbEdgesTexture,
      fbTexture,
      fb,
      staticRes.provincesUniqueColor.length / 3
    );
  }

  resizeXbrGeometry(width: number) {
    resizeXbrGeometry(this.gl, this.xbrPosBuffer, width);
  }

  fillCountryProvinceColorsTexture(countryProvinceColors: Uint8Array) {
    fillCustomProvinceColorsTexture(
      this.gl,
      this.countryProvinceColors,
      countryProvinceColors
    );
  }

  fillPrimaryProvinceColorsTexture(provinceUniqueColors: Uint8Array) {
    fillCustomProvinceColorsTexture(
      this.gl,
      this.primaryProvinceColors,
      provinceUniqueColors
    );
  }

  fillSecondaryProvinceColorsTexture(provinceUniqueColors: Uint8Array) {
    fillCustomProvinceColorsTexture(
      this.gl,
      this.secondaryProvinceColors,
      provinceUniqueColors
    );
  }
}

function createVao(gl: WebGL2RenderingContext) {
  const vao = gl.createVertexArray();
  if (vao === null) {
    throw new Error("unable to create vertex array object");
  }

  return vao;
}

export function setupFramebufferTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  width: number,
  height: number
): WebGLTexture {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const mipLevel = 0; // the largest mip
  const internalFormat = gl.RGBA; // format we want in the texture
  const srcFormat = gl.RGBA; // format of data we are supplying
  const srcType = gl.UNSIGNED_BYTE; // type of data we are supplying
  var emptyData = new Uint8Array(width * height * 4);
  gl.texImage2D(
    gl.TEXTURE_2D,
    mipLevel,
    internalFormat,
    width,
    height,
    0,
    srcFormat,
    srcType,
    emptyData
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

function setupTexture(
  gl: WebGL2RenderingContext,
  img: ImageBitmap,
  filter: number
): WebGLTexture {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  if (texture === null) {
    throw new Error("texture was null");
  }

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  const mipLevel = 0; // the largest mip
  const internalFormat = gl.RGBA; // format we want in the texture
  const srcFormat = gl.RGBA; // format of data we are supplying
  const srcType = gl.UNSIGNED_BYTE; // type of data we are supplying
  gl.texImage2D(
    gl.TEXTURE_2D,
    mipLevel,
    internalFormat,
    srcFormat,
    srcType,
    img
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

function setupProvinceColorsTexture(
  gl: WebGL2RenderingContext,
  type: GLenum,
  provinceCount: number,
  data: Uint8Array
) {
  const texture = gl.createTexture();
  if (texture === null) {
    throw new Error("unexpected null texture");
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const mipLevel = 0;
  const internalFormat = type;
  const srcFormat = type;
  const srcType = gl.UNSIGNED_BYTE;
  gl.texImage2D(
    gl.TEXTURE_2D,
    mipLevel,
    internalFormat,
    provinceCount,
    1,
    0,
    srcFormat,
    srcType,
    data
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

function setupProvinceCustomColorsTexture(
  gl: WebGL2RenderingContext,
  provinceCount: number,
  data: Uint8Array
) {
  const texture = gl.createTexture();
  if (texture === null) {
    throw new Error("unexpected null texture");
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const mipLevel = 0;
  const internalFormat = gl.RGBA;
  const srcFormat = gl.RGBA;
  const srcType = gl.UNSIGNED_BYTE;
  gl.texImage2D(
    gl.TEXTURE_2D,
    mipLevel,
    internalFormat,
    provinceCount,
    1,
    0,
    srcFormat,
    srcType,
    data
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

function fillCustomProvinceColorsTexture(
  gl: WebGL2RenderingContext,
  provinceUniqueColorsTexture: WebGLTexture,
  provinceUniqueColors: Uint8Array
) {
  const srcFormat = gl.RGBA;
  const srcType = gl.UNSIGNED_BYTE;
  gl.bindTexture(gl.TEXTURE_2D, provinceUniqueColorsTexture);
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    0,
    0,
    provinceUniqueColors.length / 4,
    1,
    srcFormat,
    srcType,
    provinceUniqueColors
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function resizeXbrGeometry(
  gl: WebGL2RenderingContext,
  positionBuffer: WebGLBuffer | null,
  width: number
) {
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  var aspectRatio = 5632.0 / 2048.0;
  var height = width / aspectRatio;
  gl.bufferData(
    gl.ARRAY_BUFFER,
    // Center image around center
    new Float32Array([
      -width / 2,
      -height / 2,
      width / 2,
      -height / 2,
      -width / 2,
      height / 2,
      -width / 2,
      height / 2,
      width / 2,
      -height / 2,
      width / 2,
      height / 2,
    ]),
    gl.STATIC_DRAW
  );
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return positionBuffer;
}

function initializeXbrTexCoords(gl: WebGL2RenderingContext) {
  const texCoordBuffer = notNull(gl.createBuffer());
  let width = IMG_WIDTH;
  let height = IMG_HEIGHT;
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      0.0,
      0.0,
      width / IMG_PADDED_WIDTH,
      0.0,
      0.0,
      height / IMG_HEIGHT,
      0.0,
      height / IMG_HEIGHT,
      width / IMG_PADDED_WIDTH,
      0.0,
      width / IMG_PADDED_WIDTH,
      height / IMG_HEIGHT,
    ]),
    gl.STATIC_DRAW
  );
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return texCoordBuffer;
}

function initializeGeometry(gl: WebGL2RenderingContext) {
  var positionBuffer = notNull(gl.createBuffer());

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  var width = 2;
  var height = 2;
  gl.bufferData(
    gl.ARRAY_BUFFER,
    // Center image around center
    new Float32Array([
      -width / 2,
      -height / 2,
      width / 2,
      -height / 2,
      -width / 2,
      height / 2,
      -width / 2,
      height / 2,
      width / 2,
      -height / 2,
      width / 2,
      height / 2,
    ]),
    gl.STATIC_DRAW
  );

  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return positionBuffer;
}

function initializeGeometryTexCoords(gl: WebGL2RenderingContext) {
  const texCoordBuffer = notNull(gl.createBuffer());
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0,
    ]),
    gl.STATIC_DRAW
  );
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return texCoordBuffer;
}
