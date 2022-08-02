import { GLResources, setupFramebufferTexture } from "./glResources";
import { ProvinceFinder } from "./ProvinceFinder";
import { throttle } from "./throttle";
import { TerrainOverlayResources } from "./staticResources";

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
}

export interface UserRect {
  top: number;
  left: number;
}

export interface DrawEvent {
  elapsedMs: number;
  viewportAnimationRequestCancelled: number;
  mapAnimationRequestCancelled: number;
}

export const glContextOptions = (): WebGLContextAttributes => ({
  alpha: true,
  depth: false,
  antialias: false,
  stencil: false,
  powerPreference: "high-performance",
  preserveDrawingBuffer: true,
  desynchronized: true,
});

export class WebGLMap {
  public scale: number;
  public pixelRatio: number = window.devicePixelRatio;
  public focusPoint: [number, number];
  private mousePos = [0, 0];
  private mouseDownInitialPos = [0, 0];
  private scrollSensitivity = 0.04;
  private maxViewWidth = 24000;
  private selectedProvinceColorInd: number | undefined;
  private hoverProvinceColorInd: number | undefined;
  private originalPrimaryColor: Uint8Array = new Uint8Array();
  private originalSecondaryColor: Uint8Array = new Uint8Array();
  public showProvinceBorders = false;
  public showCountryBorders = false;
  public showMapModeBorders = false;
  public renderTerrain = true;
  private throttledMouseMove: (arg0: any, rect?: UserRect) => void;

  private previousViewportTimestamp = 0;
  private viewportAnimationRequest: undefined | number = undefined;
  private viewportAnimationRequestCancelled: number = 0;

  private previousMapTimestamp = 0;
  private mapAnimationRequest: undefined | number = undefined;
  private mapAnimationRequestCancelled: number = 0;

  private rawMapStartTime: number = 0;

  public readonly redrawMapImage: () => void;
  public readonly redrawViewport: () => void;
  public onProvinceHover?: (proinceId: number) => void;
  public onProvinceSelection?: (proinceId: number) => void;
  public onDraw?: (event: DrawEvent) => void;
  public onCommit?: (context: WebGL2RenderingContext) => void;

  constructor(
    private gl: WebGL2RenderingContext,
    private glResources: GLResources,
    private provinceFinder: ProvinceFinder
  ) {
    this.focusPoint = [0, 0];
    this.scale = 1;

    const capViewportAnimation = () => {
      this.cancelQueuedViewportAnimation();
      if (this.mapAnimationRequest) {
        return;
      }

      this.viewportAnimationRequest = requestAnimationFrame((timestamp) => {
        if (timestamp - this.previousViewportTimestamp > 10) {
          this.previousViewportTimestamp = timestamp;
          this.redrawViewportNow();
        }
      });
    };

    const capMapAnimation = () => {
      this.rawMapStartTime = this.rawMapStartTime || performance.now();
      this.cancelQueuedMapAnimation();
      this.mapAnimationRequest = requestAnimationFrame((timestamp) => {
        if (timestamp - this.previousMapTimestamp > 10) {
          this.previousMapTimestamp = timestamp;
          this.previousViewportTimestamp = timestamp;
          this.redrawMapNow();
        }
      });
    };

    this.redrawMapImage = capMapAnimation;
    this.redrawViewport = capViewportAnimation;

    this.throttledMouseMove = throttle((args, rect) => {
      this.onMouseMove(args, rect);
    }, 100);

    gl.canvas.addEventListener("dblclick", (evt) => this.onDblClick(evt));
    gl.canvas.addEventListener("pointermove", (evt) =>
      this.throttledMouseMove(evt)
    );
  }

  get maxScale(): number {
    return (this.maxViewWidth / this.gl.canvas.width) * this.pixelRatio;
  }

  get minScale(): number {
    const canvasAspect = this.gl.canvas.width / this.gl.canvas.height;
    return Math.max(1, IMG_ASPECT / canvasAspect);
  }

  public resize(cssWidth: number, cssHeight: number) {
    this.gl.canvas.style.width = `${cssWidth}px`;
    this.gl.canvas.style.height = `${cssHeight}px`;
    this.gl.canvas.width = cssWidth * this.pixelRatio;
    this.gl.canvas.height = cssHeight * this.pixelRatio;
    this.redrawViewport();
  }

  static create(
    glResources: GLResources,
    provinceFinder: ProvinceFinder
  ): WebGLMap {
    return new WebGLMap(glResources.gl, glResources, provinceFinder);
  }

  private cancelQueuedViewportAnimation() {
    if (this.viewportAnimationRequest) {
      cancelAnimationFrame(this.viewportAnimationRequest);
      this.viewportAnimationRequestCancelled += 1;
      this.viewportAnimationRequest = undefined;
    }
  }

  private cancelQueuedMapAnimation() {
    // We cancel any viewport request as redrawing the map includes the viewport
    this.cancelQueuedViewportAnimation();

    if (this.mapAnimationRequest) {
      cancelAnimationFrame(this.mapAnimationRequest);
      this.mapAnimationRequestCancelled += 1;
      this.mapAnimationRequest = undefined;
    }
  }

  private applyMapShaderParameters() {
    this.glResources.mapShaderProgram.setTextures(this.glResources);
    this.glResources.mapShaderProgram.setRenderProvinceBorders(
      this.showProvinceBorders
    );
    this.glResources.mapShaderProgram.setRenderMapmodeBorders(
      this.showMapModeBorders
    );
    this.glResources.mapShaderProgram.setRenderCountryBorders(
      this.showCountryBorders
    );
    this.glResources.mapShaderProgram.setProvinceCount(
      this.glResources.provinceCount
    );
    this.glResources.mapShaderProgram.setTextureSize(
      IMG_PADDED_WIDTH,
      IMG_HEIGHT
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

  public redrawMapNow() {
    this.redrawRawMap();
    this.redrawViewportNow();
    this.cancelQueuedMapAnimation();
    this.rawMapStartTime = 0;
    this.mapAnimationRequestCancelled = 0;
    this.viewportAnimationRequestCancelled = 0;
  }

  public redrawViewportNow() {
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
      gl.canvas.height
    );
    this.glResources.xbrShaderProgram.setTextureSize(
      IMG_PADDED_WIDTH,
      IMG_HEIGHT
    );
    this.glResources.xbrShaderProgram.setUsedTextureSize(IMG_WIDTH, IMG_HEIGHT);
    this.glResources.xbrShaderProgram.setTextures(this.glResources);

    gl.bindVertexArray(this.glResources.xbrVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);

    this.onCommit?.(gl);
    this.glResources.xbrShaderProgram.clear();
    this.cancelQueuedViewportAnimation();
    this.viewportAnimationRequestCancelled = 0;

    requestAnimationFrame(() => {
      const end = performance.now();
      const elapsedMs = end - (this.rawMapStartTime || start);
      this.onDraw?.({
        elapsedMs,
        viewportAnimationRequestCancelled:
          this.viewportAnimationRequestCancelled,
        mapAnimationRequestCancelled: this.mapAnimationRequestCancelled,
      });
    });
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
      0
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
      this.maxViewWidth / IMG_WIDTH
    );
    this.glResources.xbrShaderProgram.setResolution(width, height);
    this.glResources.xbrShaderProgram.setFlipY(true);
    this.glResources.xbrShaderProgram.setRenderTerrain(this.renderTerrain);
    this.glResources.xbrShaderProgram.setTextureSize(
      IMG_PADDED_WIDTH,
      IMG_HEIGHT
    );
    this.glResources.xbrShaderProgram.setUsedTextureSize(IMG_WIDTH, IMG_HEIGHT);
    this.glResources.xbrShaderProgram.setTextures(this.glResources);

    gl.bindVertexArray(this.glResources.xbrVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);

    this.glResources.xbrShaderProgram.clear();
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    let data = new Uint8ClampedArray(width * height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return data;
  }

  public mapData(scale: number, type?: string): Promise<Blob | null> {
    const width = IMG_WIDTH * scale;
    const height = IMG_HEIGHT * scale;
    const data = this.generateMapImage(width, height);
    const pngCanvas = document.createElement("canvas");

    pngCanvas.width = width;
    pngCanvas.height = height;
    const ctx = pngCanvas.getContext("2d")!;
    const image = new ImageData(data, width, height);
    ctx.putImageData(image, 0, 0);

    return new Promise((resolve) => {
      pngCanvas.toBlob((result) => {
        pngCanvas.remove();
        resolve(result);
      }, type);
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
        this.originalPrimaryColor
      );
    }
  }

  private canvasDisplayDimensions() {
    const rect = this.gl.canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  private mousePosition(e: MouseEvent, rect?: UserRect) {
    const canvas = this.gl.canvas;
    if (rect) {
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;
      return [cssX, cssY];
    } else if (canvas instanceof HTMLCanvasElement) {
      const rect = canvas.getBoundingClientRect();
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;
      return [cssX, cssY];
    } else {
      return [0, 0];
    }
  }

  public moveCamera(e: MouseEvent, rect?: UserRect) {
    const [newX, newY] = this.mousePosition(e, rect);
    const newfocusPoint: [number, number] = [
      this.focusPoint[0] -
        ((newX - this.mousePos[0]) * this.pixelRatio) / this.scale,
      this.focusPoint[1] -
        ((newY - this.mousePos[1]) * this.pixelRatio) / this.scale,
    ];

    this.focusPoint = newfocusPoint;
    this.clampFocusPoint();
    this.mousePos = [newX, newY];
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

    if (this.focusPoint[0] + focusXLen / 2 > canvas.width / 2) {
      this.focusPoint[0] = canvas.width / 2 - focusXLen / 2;
    } else if (this.focusPoint[0] - focusXLen / 2 < -canvas.width / 2) {
      this.focusPoint[0] = -(canvas.width / 2) + focusXLen / 2;
    }
  }

  public onWheel(e: WheelEvent, rect?: UserRect) {
    const canvas = this.gl.canvas;
    const oldScale = this.scale;
    this.scale *= Math.pow(2, e.deltaY * -0.01);
    if (this.scale > oldScale) {
      this.scale = Math.min(
        this.scale,
        oldScale * (1 + this.scrollSensitivity)
      );
    } else if (this.scale < oldScale) {
      this.scale = Math.max(
        this.scale,
        oldScale * (1 - this.scrollSensitivity)
      );
    }

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

  public onMouseDown(e: MouseEvent, rect?: UserRect) {
    this.mousePos = this.mouseDownInitialPos = this.mousePosition(e, rect);
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

    return [pixelX, pixelY];
  }

  public onMouseUp(e: MouseEvent, rect?: UserRect) {
    const [newX, newY] = this.mousePosition(e, rect);
    const [pixelX, pixelY] = this.mousePixel(e, rect);
    const diffX = Math.abs(this.mouseDownInitialPos[0] - newX);
    const diffY = Math.abs(this.mouseDownInitialPos[1] - newY);

    if (diffX + diffY < 15) {
      const prov = this.provinceFinder.findProvinceId(pixelX, pixelY);
      if (prov.colorIndex !== this.selectedProvinceColorInd) {
        this.selectedProvinceColorInd = prov.colorIndex;
        this.highlightSelectedProvince();
        this.redrawMapNow();
        this.onProvinceSelection?.(prov.provinceId);
      }
    }
  }

  private onDblClick(e: any) {
    const [pixelX, pixelY] = this.mousePixel(e);
    const prov = this.provinceFinder.findProvinceId(pixelX, pixelY);
    if (prov.colorIndex === this.selectedProvinceColorInd) {
      console.log("double click on same province");
    }
  }

  public triggerMouseMove(e: MouseEvent, rect: UserRect) {
    this.throttledMouseMove(e, rect);
  }

  private onMouseMove(e: any, rect?: UserRect) {
    const [pixelX, pixelY] = this.mousePixel(e, rect);
    const prov = this.provinceFinder.findProvinceId(pixelX, pixelY);
    if (prov.colorIndex !== this.hoverProvinceColorInd) {
      this.hoverProvinceColorInd = prov.colorIndex;
      this.onProvinceHover?.(prov.provinceId);
    }
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
