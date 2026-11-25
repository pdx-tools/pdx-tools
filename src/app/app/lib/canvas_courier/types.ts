export interface CanvasCourierDomSurface {
  canvas: HTMLCanvasElement;
}

export interface CanvasCourierSurface extends CanvasCourierDomSurface {
  offscreen: OffscreenCanvas;
  /** The canvas over the surface, when the host has one. It takes no input. */
  overlay: OffscreenCanvas | null;
}
