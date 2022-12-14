export interface ShaderSource {
  vertex: string;
  fragment: string;
}

export interface OnScreenWegblContext extends WebGL2RenderingContext {
  canvas: HTMLCanvasElement;
}
