import { StaticResources, TerrainOverlayResources } from "./staticResources";
import { MapShader } from "./mapShader";
import { XbrShader } from "./xbrShader";
import {
  IMG_WIDTH,
  IMG_HEIGHT,
  IMG_PADDED_WIDTH,
  SPLIT_IMG_PADDED_WIDTH,
} from "./map";
import { notNull } from "./nullcheck";
import { OnScreenWegblContext } from "./types";

const MAX_TEXTURE_SIZE = 4096;

// Stores all WebGL resource data like textures, shader programs, etc.
export class GLResources {
  public constructor(
    public readonly gl: OnScreenWegblContext,
    public colorMap: WebGLTexture,
    public sea: WebGLTexture,
    public normal: WebGLTexture,
    public readonly terrain1: WebGLTexture,
    public readonly terrain2: WebGLTexture,
    public rivers1: WebGLTexture,
    public rivers2: WebGLTexture,
    public water: WebGLTexture,
    public readonly provinces1: WebGLTexture,
    public readonly provinces2: WebGLTexture,
    public stripes: WebGLTexture,
    public surfaceRock: WebGLTexture,
    public surfaceGreen: WebGLTexture,
    public surfaceNormalRock: WebGLTexture,
    public surfaceNormalGreen: WebGLTexture,
    public heightMap: WebGLTexture,
    public readonly provincesUniqueColor: WebGLTexture,
    public readonly countryProvinceColors: WebGLTexture,
    public readonly primaryProvinceColors: WebGLTexture,
    public readonly secondaryProvinceColors: WebGLTexture,
    public readonly posBuffer: WebGLBuffer,
    public readonly xbrPosBuffer: WebGLBuffer,
    public readonly rawMapTexCoordBuffer1: WebGLBuffer,
    public readonly rawMapTexCoordBuffer2: WebGLBuffer,
    public readonly xbrTexCoordBuffer: WebGLBuffer,
    public readonly rawMapVao1: WebGLVertexArrayObject,
    public readonly rawMapVao2: WebGLVertexArrayObject,
    public readonly xbrVao: WebGLVertexArrayObject,
    public readonly framebufferRawMapEdgesTexture1: WebGLTexture,
    public readonly framebufferRawMapEdgesTexture2: WebGLTexture,
    public readonly framebufferRawMapTexture1: WebGLTexture,
    public readonly framebufferRawMapTexture2: WebGLTexture,
    public readonly rawMapFramebuffer1: WebGLFramebuffer,
    public readonly rawMapFramebuffer2: WebGLFramebuffer,
    public readonly provinceCount: number,
    public readonly mapShaderProgram: MapShader,
    public readonly xbrShaderProgram: XbrShader,
  ) {
    gl.bindVertexArray(rawMapVao1);
    mapShaderProgram.bindPosBuffer(posBuffer);
    mapShaderProgram.bindTexCoordBuffer(rawMapTexCoordBuffer1);
    gl.bindVertexArray(null);

    gl.bindVertexArray(rawMapVao2);
    mapShaderProgram.bindPosBuffer(posBuffer);
    mapShaderProgram.bindTexCoordBuffer(rawMapTexCoordBuffer2);
    gl.bindVertexArray(null);

    gl.bindVertexArray(xbrVao);
    xbrShaderProgram.bindPosBuffer(xbrPosBuffer);
    xbrShaderProgram.bindTexCoordBuffer(xbrTexCoordBuffer);
    gl.bindVertexArray(null);
  }

  static create(gl: OnScreenWegblContext, staticRes: StaticResources) {
    let provinceCount = staticRes.provincesUniqueColor.length / 3;

    let rawMapFramebuffer1 = notNull(gl.createFramebuffer());
    gl.bindFramebuffer(gl.FRAMEBUFFER, rawMapFramebuffer1);
    let fbRawMapEdgesTexture1 = notNull(gl.createTexture());
    setupFramebufferTexture(
      gl,
      fbRawMapEdgesTexture1,
      SPLIT_IMG_PADDED_WIDTH,
      IMG_HEIGHT,
    );
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      fbRawMapEdgesTexture1,
      0,
    );
    let fbRawMapTexture1 = notNull(gl.createTexture());
    setupFramebufferTexture(
      gl,
      fbRawMapTexture1,
      SPLIT_IMG_PADDED_WIDTH,
      IMG_HEIGHT,
    );
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT1,
      gl.TEXTURE_2D,
      fbRawMapTexture1,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    let rawMapFramebuffer2 = notNull(gl.createFramebuffer());
    gl.bindFramebuffer(gl.FRAMEBUFFER, rawMapFramebuffer2);
    let fbRawMapEdgesTexture2 = notNull(gl.createTexture());
    setupFramebufferTexture(
      gl,
      fbRawMapEdgesTexture2,
      SPLIT_IMG_PADDED_WIDTH,
      IMG_HEIGHT,
    );
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      fbRawMapEdgesTexture2,
      0,
    );
    let fbRawMapTexture2 = notNull(gl.createTexture());
    setupFramebufferTexture(
      gl,
      fbRawMapTexture2,
      SPLIT_IMG_PADDED_WIDTH,
      IMG_HEIGHT,
    );
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT1,
      gl.TEXTURE_2D,
      fbRawMapTexture2,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var xbrPositionBuffer = notNull(gl.createBuffer());
    resizeXbrGeometry(gl, xbrPositionBuffer, gl.canvas.width);

    const provinces1 = setupTexture(gl, staticRes.provinces1, gl.NEAREST);
    const provinces2 = setupTexture(gl, staticRes.provinces2, gl.NEAREST);

    const terrain1 = setupTexture(gl, staticRes.terrain1, gl.NEAREST);
    const terrain2 = setupTexture(gl, staticRes.terrain2, gl.NEAREST);

    const rivers1 = setupTexture(gl, new ImageData(1, 1), gl.NEAREST);
    const rivers2 = setupTexture(gl, new ImageData(1, 1), gl.NEAREST);

    const colorMap = setupTexture(gl, new ImageData(1, 1), gl.LINEAR);
    const sea = setupTexture(gl, new ImageData(1, 1), gl.LINEAR);
    const normal = setupTexture(gl, new ImageData(1, 1), gl.LINEAR);
    const water = setupTexture(gl, new ImageData(1, 1), gl.LINEAR);
    const stripes = setupTexture(gl, staticRes.stripes, gl.NEAREST, gl.REPEAT);
    const surfaceRock = setupTexture(gl, new ImageData(1, 1), gl.LINEAR);
    const surfaceGreen = setupTexture(gl, new ImageData(1, 1), gl.LINEAR);
    const surfaceNormalRock = setupTexture(gl, new ImageData(1, 1), gl.LINEAR);
    const surfaceNormalGreen = setupTexture(gl, new ImageData(1, 1), gl.LINEAR);
    const heightMap = setupTexture(gl, new ImageData(1, 1), gl.LINEAR);

    return [
      gl,
      colorMap,
      sea,
      normal,
      terrain1,
      terrain2,
      rivers1,
      rivers2,
      water,
      provinces1,
      provinces2,
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
        staticRes.provincesUniqueColor,
      ),
      setupProvinceColorsTexture(gl, gl.RGBA, provinceCount),
      setupProvinceCustomColorsTexture(gl, provinceCount),
      setupProvinceCustomColorsTexture(gl, provinceCount),
      initializeGeometry(gl),
      xbrPositionBuffer,
      initializeRawMapTexCoords1(gl),
      initializeRawMapTexCoords2(gl),
      initializeXbrTexCoords(gl),
      createVao(gl),
      createVao(gl),
      createVao(gl),
      fbRawMapEdgesTexture1,
      fbRawMapEdgesTexture2,
      fbRawMapTexture1,
      fbRawMapTexture2,
      rawMapFramebuffer1,
      rawMapFramebuffer2,
      staticRes.provincesUniqueColor.length / 3,
    ] as const;
  }

  resizeXbrGeometry(width: number) {
    resizeXbrGeometry(this.gl, this.xbrPosBuffer, width);
  }

  fillCountryProvinceColorsTexture(countryProvinceColors: Uint8Array) {
    fillCustomProvinceColorsTexture(
      this.gl,
      this.countryProvinceColors,
      countryProvinceColors,
    );
  }

  fillPrimaryProvinceColorsTexture(provinceUniqueColors: Uint8Array) {
    fillCustomProvinceColorsTexture(
      this.gl,
      this.primaryProvinceColors,
      provinceUniqueColors,
    );
  }

  fillSecondaryProvinceColorsTexture(provinceUniqueColors: Uint8Array) {
    fillCustomProvinceColorsTexture(
      this.gl,
      this.secondaryProvinceColors,
      provinceUniqueColors,
    );
  }

  updateTerrainTextures(textures: TerrainOverlayResources) {
    const { gl } = this;
    this.rivers1 = setupTexture(gl, textures.rivers1, gl.NEAREST);
    this.rivers2 = setupTexture(gl, textures.rivers2, gl.NEAREST);

    this.colorMap = setupTexture(gl, textures.colorMap, gl.LINEAR);
    this.sea = setupTexture(gl, textures.sea, gl.LINEAR);
    this.normal = setupTexture(gl, textures.normal, gl.LINEAR);
    this.water = setupTexture(gl, textures.water, gl.LINEAR);
    this.surfaceRock = setupTexture(gl, textures.surfaceRock, gl.LINEAR);
    this.surfaceGreen = setupTexture(gl, textures.surfaceGreen, gl.LINEAR);
    this.surfaceNormalRock = setupTexture(
      gl,
      textures.surfaceNormalRock,
      gl.LINEAR,
    );
    this.surfaceNormalGreen = setupTexture(
      gl,
      textures.surfaceNormalGreen,
      gl.LINEAR,
    );
    this.heightMap = setupTexture(gl, textures.heightMap, gl.LINEAR);
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
  height: number,
): WebGLTexture {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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
    emptyData,
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

function setupTexture(
  gl: WebGL2RenderingContext,
  img: TexImageSource,
  filter: number,
  wrap?: number,
): WebGLTexture {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  if (texture === null) {
    throw new Error("texture was null");
  }

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap ?? gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap ?? gl.CLAMP_TO_EDGE);
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
    img,
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

function setupProvinceColorsTexture(
  gl: WebGL2RenderingContext,
  type: GLenum,
  provinceCount: number,
  data?: Uint8Array,
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

  const total =
    MAX_TEXTURE_SIZE * (Math.floor(provinceCount / MAX_TEXTURE_SIZE) + 1) * 4;
  const buffed = new Uint8Array(total);
  if (data) {
    buffed.set(data);
  }

  gl.texImage2D(
    gl.TEXTURE_2D,
    mipLevel,
    internalFormat,
    Math.min(MAX_TEXTURE_SIZE, provinceCount),
    Math.floor(provinceCount / MAX_TEXTURE_SIZE) + 1,
    0,
    srcFormat,
    srcType,
    buffed,
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

function setupProvinceCustomColorsTexture(
  gl: WebGL2RenderingContext,
  provinceCount: number,
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

  const total =
    MAX_TEXTURE_SIZE * (Math.floor(provinceCount / MAX_TEXTURE_SIZE) + 1) * 4;
  const buffed = new Uint8Array(total);

  gl.texImage2D(
    gl.TEXTURE_2D,
    mipLevel,
    internalFormat,
    Math.min(MAX_TEXTURE_SIZE, provinceCount),
    Math.floor(provinceCount / MAX_TEXTURE_SIZE) + 1,
    0,
    srcFormat,
    srcType,
    buffed,
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

function fillCustomProvinceColorsTexture(
  gl: WebGL2RenderingContext,
  provinceUniqueColorsTexture: WebGLTexture,
  provinceUniqueColors: Uint8Array,
) {
  const srcFormat = gl.RGBA;
  const srcType = gl.UNSIGNED_BYTE;
  gl.bindTexture(gl.TEXTURE_2D, provinceUniqueColorsTexture);
  const provinceCount = provinceUniqueColors.length / 4;

  const total =
    MAX_TEXTURE_SIZE * (Math.floor(provinceCount / MAX_TEXTURE_SIZE) + 1) * 4;
  const buffed = new Uint8Array(total);
  buffed.set(provinceUniqueColors);

  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    0,
    0,
    Math.min(MAX_TEXTURE_SIZE, provinceCount),
    Math.floor(provinceCount / MAX_TEXTURE_SIZE) + 1,
    srcFormat,
    srcType,
    buffed,
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function resizeXbrGeometry(
  gl: WebGL2RenderingContext,
  positionBuffer: WebGLBuffer | null,
  width: number,
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
    gl.STATIC_DRAW,
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
    gl.STATIC_DRAW,
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
    gl.STATIC_DRAW,
  );

  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return positionBuffer;
}

function initializeRawMapTexCoords1(gl: WebGL2RenderingContext) {
  var share = SPLIT_IMG_PADDED_WIDTH / IMG_WIDTH;
  const texCoordBuffer = notNull(gl.createBuffer());
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      0.0,
      0.0,
      share,
      0.0,
      0.0,
      1.0,
      0.0,
      1.0,
      share,
      0.0,
      share,
      1.0,
    ]),
    gl.STATIC_DRAW,
  );
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return texCoordBuffer;
}

function initializeRawMapTexCoords2(gl: WebGL2RenderingContext) {
  var share = SPLIT_IMG_PADDED_WIDTH / IMG_WIDTH;
  const texCoordBuffer = notNull(gl.createBuffer());
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      share,
      0.0,
      1.0,
      0.0,
      share,
      1.0,
      share,
      1.0,
      1.0,
      0.0,
      1.0,
      1.0,
    ]),
    gl.STATIC_DRAW,
  );
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return texCoordBuffer;
}
