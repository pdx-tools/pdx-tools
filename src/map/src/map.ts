import { GLResources, setupFramebufferTexture } from "./glResources";
import { ProvinceFinder } from "./ProvinceFinder";
import type { TerrainOverlayResources } from "./types";

export const IMG_HEIGHT = 2048;
export const IMG_WIDTH = 5632;
export const IMG_PADDED_WIDTH = 8192;
export const SPLIT_IMG_PADDED_WIDTH = 4096;
const IMG_ASPECT = IMG_WIDTH / IMG_HEIGHT;

export interface MouseEvent {
  clientX: number;
  clientY: number;
}

export interface WheelEvent extends MouseEvent {
  deltaY: number;
  eventDiff: number;
}

export type MoveEvent = {
  deltaX: number;
  deltaY: number;
};

export interface UserRect {
  top: number;
  left: number;
}

export interface DrawEvent {
  elapsedMs: number;
  viewportDrawsQueued: number;
  mapDrawsQueued: number;
}

export const glContextOptions = (): WebGLContextAttributes => ({
  depth: false,
  antialias: false,
  stencil: false,

  // In dual GPU systems, prefer the more powerful one
  powerPreference: "high-performance",

  // Avoid alpha:false, which can be expensive
  // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#avoid_alphafalse_which_can_be_expensive
  alpha: true,

  // We force a redraw whenever exporting a view, so this can be false to
  // facilitate wegbl swaps instead of copies:
  // https://stackoverflow.com/a/27747016/433785
  preserveDrawingBuffer: false,

  // Unsure why this is required
  desynchronized: false,
});

export class WebGLMap {
  public scale: number;
  public focusPoint: [number, number];
  private maxViewWidth = 24000;
  private selectedProvinceColorInd: number | undefined;
  private originalPrimaryColor: Uint8Array = new Uint8Array();
  private originalSecondaryColor: Uint8Array = new Uint8Array();
  public showProvinceBorders = false;
  public showCountryBorders = false;
  public showMapModeBorders = false;
  public renderTerrain = false;

  private viewportDrawsQueued: number = 0;
  private mapDrawsQueued: number = 0;

  public onProvinceSelection?: (proinceId: number) => void;
  public onDraw?: (event: DrawEvent) => void;
  public onCommit?: (context: WebGL2RenderingContext) => void;
  private redrawViewportTask: Promise<void> | undefined;
  private redrawMapTask: Promise<void> | undefined;
  private queuedViewportTask: Promise<void> | undefined;
  private queuedMapTask: Promise<void> | undefined;

  constructor(
    public readonly gl: WebGL2RenderingContext,
    private glResources: GLResources,
    private provinceFinder: ProvinceFinder,
    public pixelRatio: number,
  ) {
    this.focusPoint = [0, 0];
    this.scale = 1;
  }

  get maxScale(): number {
    return (this.maxViewWidth / this.gl.canvas.width) * this.pixelRatio;
  }

  get minScale(): number {
    const canvasAspect = this.gl.canvas.width / this.gl.canvas.height;
    return Math.max(1, IMG_ASPECT / canvasAspect);
  }

  public resize(cssWidth: number, cssHeight: number) {
    this.gl.canvas.width = cssWidth * this.pixelRatio;
    this.gl.canvas.height = cssHeight * this.pixelRatio;
  }

  static create(
    glResources: GLResources,
    provinceFinder: ProvinceFinder,
    pixelRatio: number,
  ): WebGLMap {
    return new WebGLMap(
      glResources.gl,
      glResources,
      provinceFinder,
      pixelRatio,
    );
  }

  /** Returns a promise for when the canvas has been updated with latest viewport */
  public redrawViewport = async () => {
    // If there's already a queue to redraw, let's defer to them
    const alreadyQueued = this.queuedViewportTask ?? this.queuedMapTask;
    if (alreadyQueued) {
      this.viewportDrawsQueued += 1;
      return alreadyQueued;
    }

    // Create the queue if there's an outstanding task
    this.queuedViewportTask = this.redrawViewportTask ?? this.redrawMapTask;
    if (this.queuedViewportTask) {
      await this.queuedViewportTask;
      this.queuedViewportTask = undefined;
    }

    this.redrawViewportNow();
    return (this.redrawViewportTask = new Promise((res) =>
      requestAnimationFrame((_) => {
        this.redrawViewportTask = undefined;
        res(void 0);
      }),
    ));
  };

  /** Returns a promise for when the canvas has been updated with latest map data */
  public redrawMap = async () => {
    const alreadyQueued = this.queuedMapTask;
    if (alreadyQueued) {
      this.mapDrawsQueued += 1;
      return alreadyQueued;
    }

    this.queuedMapTask = this.redrawMapTask;
    if (this.queuedMapTask) {
      await this.queuedMapTask;
      this.queuedMapTask = undefined;
    }

    this.redrawMapNow();
    return (this.redrawMapTask = new Promise((res) =>
      requestAnimationFrame((_) => {
        this.redrawMapTask = undefined;
        res(void 0);
      }),
    ));
  };

  private applyMapShaderParameters() {
    this.glResources.mapShaderProgram.setTextures(this.glResources);
    this.glResources.mapShaderProgram.setRenderProvinceBorders(
      this.showProvinceBorders,
    );
    this.glResources.mapShaderProgram.setRenderMapmodeBorders(
      this.showMapModeBorders,
    );
    this.glResources.mapShaderProgram.setRenderCountryBorders(
      this.showCountryBorders,
    );
    this.glResources.mapShaderProgram.setProvinceCount(
      this.glResources.provinceCount,
    );
    this.glResources.mapShaderProgram.setTextureSize(
      IMG_PADDED_WIDTH,
      IMG_HEIGHT,
    );
  }

  private redrawRawMapLeft() {
    const gl = this.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.glResources.rawMapFramebuffer1);
    let drawBuffers = [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1];
    gl.drawBuffers(drawBuffers);
    gl.bindTexture(gl.TEXTURE_2D, this.glResources.framebufferRawMapTexture1);

    gl.viewport(0, 0, SPLIT_IMG_PADDED_WIDTH, IMG_HEIGHT);
    gl.clearColor(0.0, 0.0, 0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this.glResources.mapShaderProgram.use();
    gl.bindVertexArray(this.glResources.rawMapVao1);
    this.applyMapShaderParameters();

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.glResources.mapShaderProgram.clear();

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.flush();
  }

  private redrawRawMapRight() {
    const gl = this.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.glResources.rawMapFramebuffer2);
    let drawBuffers = [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1];
    gl.drawBuffers(drawBuffers);
    gl.bindTexture(gl.TEXTURE_2D, this.glResources.framebufferRawMapTexture2);

    gl.viewport(0, 0, IMG_WIDTH - SPLIT_IMG_PADDED_WIDTH, IMG_HEIGHT);
    gl.clearColor(0.0, 0.0, 0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this.glResources.mapShaderProgram.use();
    gl.bindVertexArray(this.glResources.rawMapVao2);
    this.applyMapShaderParameters();

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.glResources.mapShaderProgram.clear();

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.flush();
  }

  public redrawRawMap() {
    this.redrawRawMapLeft();
    this.redrawRawMapRight();
  }

  private redrawMapNow() {
    this.redrawRawMap();
    this.redrawViewportNow();
    this.mapDrawsQueued = 0;
    this.viewportDrawsQueued = 0;
  }

  private redrawViewportNow() {
    const start = performance.now();
    const gl = this.gl;
    this.scale = Math.max(this.minScale, this.scale) || 1;
    this.scale = Math.min(this.maxScale, this.scale);
    this.clampFocusPoint();

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.0, 0, 0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this.glResources.resizeXbrGeometry(gl.canvas.width);
    this.glResources.xbrShaderProgram.use();
    this.glResources.xbrShaderProgram.setFocusPoint(this.focusPoint);
    this.glResources.xbrShaderProgram.setScale(this.scale);
    this.glResources.xbrShaderProgram.setMaxScale(this.maxScale);
    this.glResources.xbrShaderProgram.setFlipY(false);
    this.glResources.xbrShaderProgram.setRenderTerrain(this.renderTerrain);
    this.glResources.xbrShaderProgram.setResolution(
      gl.canvas.width,
      gl.canvas.height,
    );
    this.glResources.xbrShaderProgram.setTextureSize(
      IMG_PADDED_WIDTH,
      IMG_HEIGHT,
    );
    this.glResources.xbrShaderProgram.setUsedTextureSize(IMG_WIDTH, IMG_HEIGHT);
    this.glResources.xbrShaderProgram.setTextures(this.glResources);

    gl.bindVertexArray(this.glResources.xbrVao);
    gl.drawArrays(gl.TRIANGLES, 0, 18);

    requestAnimationFrame(() => {
      const end = performance.now();
      const elapsedMs = end - start;
      this.onDraw?.({
        elapsedMs,
        viewportDrawsQueued: this.viewportDrawsQueued,
        mapDrawsQueued: this.mapDrawsQueued,
      });
    });

    gl.bindVertexArray(null);

    this.onCommit?.(gl);
    this.glResources.xbrShaderProgram.clear();
    this.viewportDrawsQueued = 0;
  }

  public generateMapImage(width: number, height: number) {
    const gl = this.gl;

    let fb = gl.createFramebuffer();
    let fbTexture = <WebGLTexture>gl.createTexture();
    setupFramebufferTexture(gl, fbTexture, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      fbTexture,
      0,
    );
    gl.bindTexture(gl.TEXTURE_2D, fbTexture);

    gl.viewport(0, 0, width, height);
    gl.clearColor(0.0, 0.0, 0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.glResources.resizeXbrGeometry(width);
    this.glResources.xbrShaderProgram.use();
    this.glResources.xbrShaderProgram.setFocusPoint([0, 0]);
    this.glResources.xbrShaderProgram.setScale(1.0);
    this.glResources.xbrShaderProgram.setMaxScale(
      this.maxViewWidth / IMG_WIDTH,
    );
    this.glResources.xbrShaderProgram.setResolution(width, height);
    this.glResources.xbrShaderProgram.setFlipY(true);
    this.glResources.xbrShaderProgram.setRenderTerrain(this.renderTerrain);
    this.glResources.xbrShaderProgram.setTextureSize(
      IMG_PADDED_WIDTH,
      IMG_HEIGHT,
    );
    this.glResources.xbrShaderProgram.setUsedTextureSize(IMG_WIDTH, IMG_HEIGHT);
    this.glResources.xbrShaderProgram.setTextures(this.glResources);

    gl.bindVertexArray(this.glResources.xbrVao);
    gl.drawArrays(gl.TRIANGLES, 0, 18);
    gl.bindVertexArray(null);

    this.glResources.xbrShaderProgram.clear();
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    let data = new Uint8ClampedArray(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return data;
  }

  public mapData(scale: number): Promise<Blob | null> {
    const width = IMG_WIDTH * scale;
    const height = IMG_HEIGHT * scale;
    const data = this.generateMapImage(width, height);
    const worker = new Worker(new URL("./screenshot-worker", import.meta.url));

    const pngCanvas = new OffscreenCanvas(width, height);
    worker.postMessage({ canvas: pngCanvas, data }, [pngCanvas, data.buffer]);
    return new Promise<Blob>((res) => {
      worker.onmessage = (ev) => {
        res(ev.data.blob);
        worker.terminate();
      };
    });
  }

  public updateTerrainTextures(textures: TerrainOverlayResources) {
    this.glResources.updateTerrainTextures(textures);
  }

  public updateCountryProvinceColors(primaryPoliticalColors: Uint8Array) {
    this.glResources.fillCountryProvinceColorsTexture(primaryPoliticalColors);
  }

  public updateProvinceColors(primary: Uint8Array, seconday: Uint8Array) {
    this.originalPrimaryColor = primary;
    this.originalSecondaryColor = seconday;

    this.glResources.fillPrimaryProvinceColorsTexture(primary);
    this.glResources.fillSecondaryProvinceColorsTexture(seconday);
    this.highlightSelectedProvince();
  }

  public highlightProvince(provinceColorIndex: number) {
    this.selectedProvinceColorInd = provinceColorIndex;
    this.highlightSelectedProvince();
  }

  public unhighlightProvince() {
    this.selectedProvinceColorInd = undefined;
    this.highlightSelectedProvince();
  }

  private highlightSelectedProvince() {
    if (this.selectedProvinceColorInd !== undefined) {
      const newPrimary = this.originalPrimaryColor.slice();
      newPrimary[this.selectedProvinceColorInd * 4] = 255;
      newPrimary[this.selectedProvinceColorInd * 4 + 1] = 255;
      newPrimary[this.selectedProvinceColorInd * 4 + 2] = 255;

      this.glResources.fillPrimaryProvinceColorsTexture(newPrimary);

      const isStriped =
        this.originalPrimaryColor[this.selectedProvinceColorInd * 4] !=
          this.originalSecondaryColor[this.selectedProvinceColorInd * 4] ||
        this.originalPrimaryColor[this.selectedProvinceColorInd * 4 + 1] !=
          this.originalSecondaryColor[this.selectedProvinceColorInd * 4 + 1] ||
        this.originalPrimaryColor[this.selectedProvinceColorInd * 4 + 2] !=
          this.originalSecondaryColor[this.selectedProvinceColorInd * 4 + 2];

      const newSecondary = this.originalSecondaryColor.slice();
      if (!isStriped) {
        newSecondary[this.selectedProvinceColorInd * 4] = 255;
        newSecondary[this.selectedProvinceColorInd * 4 + 1] = 255;
        newSecondary[this.selectedProvinceColorInd * 4 + 2] = 255;
      }

      this.glResources.fillSecondaryProvinceColorsTexture(newSecondary);
    } else {
      this.glResources.fillPrimaryProvinceColorsTexture(
        this.originalPrimaryColor,
      );
      this.glResources.fillSecondaryProvinceColorsTexture(
        this.originalSecondaryColor,
      );
    }
  }

  private canvasDisplayDimensions() {
    return {
      width: this.gl.canvas.width / this.pixelRatio,
      height: this.gl.canvas.height / this.pixelRatio,
    };
  }

  private mousePosition(e: MouseEvent, rect?: UserRect) {
    const cssX = e.clientX - (rect?.left ?? 0);
    const cssY = e.clientY - (rect?.top ?? 0);
    return [cssX, cssY];
  }

  public moveCamera(e: MoveEvent) {
    const newfocusPoint: [number, number] = [
      this.focusPoint[0] - (e.deltaX * this.pixelRatio) / this.scale,
      this.focusPoint[1] - (e.deltaY * this.pixelRatio) / this.scale,
    ];

    this.focusPoint = newfocusPoint;
    this.clampFocusPoint();
  }

  public moveCameraTo({
    x,
    y,
    offsetX,
  }: {
    x: number;
    y: number;
    offsetX?: number;
  }) {
    const width = this.gl.canvas.width;
    const height = this.gl.canvas.height;

    const IMG_ASPECT = IMG_WIDTH / IMG_HEIGHT;
    const initX = ((x - IMG_WIDTH / 2) / (IMG_WIDTH / 2)) * (width / 2);
    const initY =
      (((y - IMG_HEIGHT / 2) / (IMG_HEIGHT / 2)) * (height / 2)) /
      (IMG_ASPECT / (width / height));

    this.focusPoint = [initX, initY];
    if (offsetX) {
      this.focusPoint[0] = initX + offsetX / 2 / this.scale;
    }
  }

  private clampFocusPoint() {
    const { canvas } = this.gl;
    const canvasAspect = this.gl.canvas.width / this.gl.canvas.height;
    const trueScale = this.scale / this.minScale;
    const focusYLen = canvas.height / trueScale;
    const focusXLen = canvas.width / this.scale;

    const yAspect = IMG_ASPECT / canvasAspect;
    const focusYAdj = this.focusPoint[1] * yAspect;

    if (focusYAdj + focusYLen / 2 > canvas.height / 2) {
      this.focusPoint[1] = (canvas.height / 2 - focusYLen / 2) / yAspect;
    } else if (focusYAdj - focusYLen / 2 < -canvas.height / 2) {
      this.focusPoint[1] = (-canvas.height / 2 + focusYLen / 2) / yAspect;
    }

    const wrappedAround = (canvas.width + focusXLen) / 2;
    const wrapAdj = canvas.width / 2 - focusXLen / 2;
    if (this.focusPoint[0] > wrappedAround) {
      this.focusPoint[0] = (this.focusPoint[0] % wrappedAround) - wrapAdj;
    } else if (this.focusPoint[0] < -wrappedAround) {
      this.focusPoint[0] = (this.focusPoint[0] % wrappedAround) + wrapAdj;
    }
  }

  public onWheel(e: WheelEvent, rect?: UserRect) {
    const oldScale = this.scale;
    const clampedY = Math.max(-30, Math.min(30, e.deltaY));
    this.scale *= Math.pow(
      2,
      clampedY * -0.01 * (Math.min(e.eventDiff, 64) / 64),
    );

    this.scale = Math.max(this.minScale, this.scale);
    this.scale = Math.min(this.maxScale, this.scale);

    const { height, width } = this.canvasDisplayDimensions();

    const focusYLen = height / this.scale;
    const focusYOldLen = height / oldScale;

    const focusXLen = width / this.scale;
    const focusXOldLen = width / oldScale;

    const [newX, newY] = this.mousePosition(e, rect);
    const clipX = ((newX - width / 2) / width) * 2;
    const clipY = ((newY - height / 2) / height) * 2;

    if (this.scale !== oldScale) {
      this.focusPoint[0] +=
        clipX * -((focusXLen - focusXOldLen) / 2) * this.pixelRatio;
      this.focusPoint[1] +=
        clipY * -((focusYLen - focusYOldLen) / 2) * this.pixelRatio;
    }

    this.clampFocusPoint();
  }

  private mousePixel(e: MouseEvent, rect?: UserRect) {
    const { height, width } = this.canvasDisplayDimensions();
    const trueScale = this.scale / this.minScale;
    const canvasAspect = width / height;
    const focusYLen = height / trueScale;
    const focusYAdj =
      (this.focusPoint[1] * (IMG_ASPECT / canvasAspect)) / this.pixelRatio;

    const focusXLen = width / this.scale;
    const focusXAdj = this.focusPoint[0] / this.pixelRatio;

    const [newX, newY] = this.mousePosition(e, rect);
    const clipX = ((newX - width / 2) / width) * 2;
    const clipY = ((newY - height / 2) / height) * 2;

    const mouseFocusX = focusXAdj + clipX * (focusXLen / 2);
    const mouseFocusY = focusYAdj + clipY * (focusYLen / 2);

    const pixelX = ((mouseFocusX + width / 2) / width) * IMG_WIDTH;
    const pixelY = ((mouseFocusY + height / 2) / height) * IMG_HEIGHT;

    return [(pixelX + IMG_WIDTH) % IMG_WIDTH, pixelY];
  }

  public findProvince(e: MouseEvent) {
    const [pixelX, pixelY] = this.mousePixel(e);
    const prov = this.provinceFinder.findProvinceId(pixelX, pixelY);
    return prov;
  }

  public zoomIn() {
    const incr = this.maxScale / 3;
    this.scale += this.scale / incr;
  }

  public zoomOut() {
    const incr = this.maxScale / 3;
    this.scale -= this.scale / incr;
  }
}
