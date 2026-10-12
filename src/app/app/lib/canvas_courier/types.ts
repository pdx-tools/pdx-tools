export interface CanvasCourierDomSurface {
  canvas: HTMLCanvasElement;
}

export interface CanvasCourierSurface extends CanvasCourierDomSurface {
  offscreen: OffscreenCanvas;
}
