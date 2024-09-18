export { GLResources } from "./glResources";
export { IMG_HEIGHT, IMG_WIDTH, WebGLMap, glContextOptions } from "./map";
export { MapShader } from "./MapShader";
export { ProvinceFinder } from "./ProvinceFinder";
export { compileShaders } from "./shaderCompiler";
export { XbrShader } from "./XbrShader";
export { type StaticResources, type TerrainOverlayResources } from "./types";
export { type MapWorker } from "./map-worker-bridge";
export { MapController } from "./MapController";
export { type InitToken } from "./map-worker";

export function createMapWorker() {
  return new Worker(new URL("./map-worker-bridge", import.meta.url), {
    type: "module",
  });
}
