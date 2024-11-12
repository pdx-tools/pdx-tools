import { gameVersion, resources } from "@/lib/game_gen";
import { glContextOptions, WebGLMap } from "map";
import { MapOnlyControls } from "../../types/map";
import { fetchOk } from "@/lib/fetch";
import mapVertex from "../../../../../../map/assets/shaders/map.vert?url";
import mapFragment from "../../../../../../map/assets/shaders/map.frag?url";
import xbrVertex from "../../../../../../map/assets/shaders/xbr.vert?url";
import xbrFragment from "../../../../../../map/assets/shaders/xbr.frag?url";

export const shaderUrls = () => ({
  map: {
    vertex: mapVertex,
    fragment: mapFragment,
  },
  xbr: {
    vertex: xbrVertex,
    fragment: xbrFragment,
  },
});

export async function fetchProvinceUniqueIndex(
  version: string,
): Promise<Uint16Array> {
  const url = resources(gameVersion(version));

  return fetchOk(url.provincesUniqueIndex)
    .then((x) => x.arrayBuffer())
    .then((x) => new Uint16Array(x));
}

export function resourceUrls(version: string) {
  return resources(gameVersion(version));
}

export function glContext(
  canvas: HTMLCanvasElement,
  options?: WebGLContextAttributes,
): WebGL2RenderingContext | null {
  const arg = { ...glContextOptions(), ...options };
  return canvas.getContext("webgl2", arg);
}

export function setMapControls(map: WebGLMap, controls: MapOnlyControls) {
  map.showProvinceBorders = controls.showProvinceBorders;
  map.showMapModeBorders = controls.showMapModeBorders;
  map.showCountryBorders = controls.showCountryBorders;
  map.renderTerrain = controls.showTerrain;
}
