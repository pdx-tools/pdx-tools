import { overlayDate } from "./canvasOverlays";
import { GLResources } from "./glResources";
import {
  glContextOptions,
  IMG_HEIGHT,
  IMG_WIDTH,
  WebGLMap,
  type DrawEvent,
  type MouseEvent,
  type MoveEvent,
  type UserRect,
  type WheelEvent,
} from "./map";
import { MapShader } from "./MapShader";
import { ProvinceFinder } from "./ProvinceFinder";
import {
  fetchOk,
  loadBaseImages,
  loadShaders,
  loadTerrainImages,
  provinceIdToColorIndexInvert,
} from "./resources";
import { compileShaders } from "./shaderCompiler";
import {
  type BaseImageResourceUrls,
  type ShaderSourceUrls,
  type StaticResources,
  type TerrainOverlayResources,
  type TerrainOverlayResourcesUrls,
} from "./types";
import { XbrShader } from "./XbrShader";

let state: Partial<{
  canvas: OffscreenCanvas;
  gl: WebGL2RenderingContext;
  mapShader: MapShader;
  xbrShader: XbrShader;
  glInit: ReturnType<typeof GLResources.create>;
  colorIndexToProvinceId: Uint16Array;
  staticResources: StaticResources;
  map: WebGLMap;
  terrainImages: TerrainOverlayResources;
  terrainImageUrls: TerrainOverlayResourcesUrls;
  stash: {
    focusPoint: [number, number];
    scale: number;
    width: number;
    height: number;
  };
}> = {};

declare const tag: unique symbol;
export type InitToken = unknown & {
  readonly [tag]: InitToken;
};
export type ResourcesToken = unknown & {
  readonly [tag]: ResourcesToken;
};
export type MapToken = unknown & {
  readonly [tag]: MapToken;
};
export type TerrainToken = unknown & {
  readonly [tag]: TerrainToken;
};

export async function init(
  canvas: OffscreenCanvas,
  sourceUrls: {
    map: ShaderSourceUrls;
    xbr: ShaderSourceUrls;
  },
) {
  state.canvas = canvas;
  const gl = canvas.getContext("webgl2", glContextOptions());
  if (gl === null) {
    throw new Error("unable to acquire webgl2 context");
  }

  state.gl = gl;
  const shaders = await loadShaders(sourceUrls);
  const compilation = compileShaders(gl, [shaders.map, shaders.xbr]);
  return new Promise<InitToken>((res) =>
    queueMicrotask(() => {
      const [mapProgram, xbrProgram] = compilation.linked();
      state.mapShader = MapShader.create(gl, mapProgram);
      state.xbrShader = XbrShader.create(gl, xbrProgram);
      res({} as InitToken);
    }),
  );
}

export async function withResources(
  urls: BaseImageResourceUrls,
  provincesUniqueColorUrl: string,
  provincesUniqueIndexUrl: string,
) {
  const resourceTask = Promise.all([
    loadBaseImages(urls),
    fetchOk(provincesUniqueColorUrl)
      .then((x) => x.arrayBuffer())
      .then((x) => new Uint8Array(x)),
  ]);
  const colorIndexToProvinceIdTask = fetchOk(provincesUniqueIndexUrl)
    .then((x) => x.arrayBuffer())
    .then((x) => provinceIdToColorIndexInvert(new Uint16Array(x)));

  const [images, provincesUniqueColor] = await resourceTask;
  const staticResources = { ...images, provincesUniqueColor };
  const glInit = GLResources.create(state.gl!, staticResources);
  const colorIndexToProvinceId = await colorIndexToProvinceIdTask;
  state.colorIndexToProvinceId = colorIndexToProvinceId;
  state.glInit = glInit;
  state.staticResources = staticResources;
  return {} as ResourcesToken;
}

export async function withMap(
  pixelRatio: number,
  _init: InitToken,
  _resources: ResourcesToken,
  _terrain: TerrainToken,
) {
  const glInit = state.glInit!;
  const mapShader = state.mapShader!;
  const xbrShader = state.xbrShader!;
  const staticResources = state.staticResources!;
  const colorIndexToProvinceId = state.colorIndexToProvinceId!;

  const glResources = new GLResources(...glInit, mapShader, xbrShader);

  const finder = new ProvinceFinder(
    staticResources.provinces1,
    staticResources.provinces2,
    staticResources.provincesUniqueColor,
    colorIndexToProvinceId,
  );
  const map = WebGLMap.create(glResources, finder, pixelRatio);
  state.map = map;
  if (state.terrainImages) {
    map.updateTerrainTextures(state.terrainImages);
  }

  return {} as MapToken;
}

export async function withTerrainImages(
  url: TerrainOverlayResourcesUrls,
  { eager }: { eager: boolean },
) {
  if (eager) {
    state.terrainImages = await loadTerrainImages(url);
  } else {
    state.terrainImageUrls = url;
  }
  return {} as TerrainToken;
}

export type ScreenshotOptions = (
  | {
      kind: "viewport";
    }
  | {
      kind: "world";
      scale: number;
    }
) &
  Partial<{ date: string; fontFamily: string }>;

export async function screenshot(
  _map: MapToken,
  screenshot: ScreenshotOptions,
  options?: ImageEncodeOptions,
) {
  const canvas = state.canvas!;
  const map = state.map!;

  const offscreen =
    screenshot.kind === "viewport"
      ? new OffscreenCanvas(canvas.width, canvas.height)
      : new OffscreenCanvas(
          IMG_WIDTH * screenshot.scale,
          IMG_HEIGHT * screenshot.scale,
        );

  const ctx2d = offscreen.getContext("2d", { alpha: false })!;
  if (screenshot.kind === "viewport") {
    map.redrawMap();
    ctx2d.drawImage(canvas, 0, 0);
  } else {
    const data = map.generateMapImage(offscreen.width, offscreen.height);
    const image = new ImageData(data, offscreen.width, offscreen.height);
    ctx2d.putImageData(image, 0, 0);
  }

  if (screenshot.date && screenshot.fontFamily) {
    const scale =
      screenshot.kind === "viewport" ? map.pixelRatio : screenshot.scale * 4;
    ctx2d.font = `700 ${20 * scale}px ${screenshot.fontFamily}`;
    overlayDate({
      ctx2d,
      date: screenshot.date,
      scale,
      textMetrics: ctx2d.measureText(screenshot.date),
    });
  }

  return offscreen.convertToBlob(options);
}

export async function highlightProvince(
  _map: MapToken,
  provinceColorIndex: number,
) {
  const map = state.map!;
  map.highlightProvince(provinceColorIndex);
  map.redrawMap();
}

export async function unhighlightProvince(_map: MapToken) {
  const map = state.map!;
  map.unhighlightProvince();
  map.redrawMap();
}

export async function onDraw(
  _map: MapToken,
  onDraw: (event: DrawEvent) => void,
) {
  const map = state.map!;
  map.onDraw = onDraw;
}

export type UpdateOptions = {
  showProvinceBorders?: boolean;
  showCountryBorders?: boolean;
  showMapModeBorders?: boolean;
  renderTerrain?: boolean;
};

export async function withCommands(
  commands: (
    | {
        kind: "country-province-colors";
        primaryPoliticalColors: Uint8Array;
      }
    | {
        kind: "province-colors";
        primary: Uint8Array;
        secondary: Uint8Array;
      }
    | {
        kind: "draw-map" | "draw-viewport" | "zoom-out" | "zoom-in";
      }
    | {
        kind: "resize";
        width: number;
        height: number;
      }
    | {
        kind: "wheel";
        event: WheelEvent;
        rect?: UserRect;
      }
    | {
        kind: "move-camera";
        event: MoveEvent;
      }
    | {
        kind: "move-camera-to";
        event: {
          x: number;
          y: number;
          offsetX?: number;
        };
      }
    | ({
        kind: "update";
      } & UpdateOptions)
  )[],
  _map: MapToken,
) {
  const map = state.map!;

  for (const command of commands) {
    switch (command.kind) {
      case "country-province-colors": {
        map.updateCountryProvinceColors(command.primaryPoliticalColors);
        break;
      }
      case "province-colors": {
        map.updateProvinceColors(command.primary, command.secondary);
        break;
      }
      case "draw-map": {
        await map.redrawMap();
        break;
      }
      case "draw-viewport": {
        await map.redrawViewport();
        break;
      }
      case "resize": {
        map.resize(command.width, command.height);
        break;
      }
      case "wheel": {
        map.onWheel(command.event, command.rect);
        break;
      }
      case "move-camera": {
        map.moveCamera(command.event);
        break;
      }
      case "move-camera-to": {
        map.moveCameraTo(command.event);
        break;
      }
      case "zoom-out": {
        map.zoomOut();
        break;
      }
      case "zoom-in": {
        map.zoomIn();
        break;
      }
      case "update": {
        map.showProvinceBorders =
          command.showProvinceBorders ?? map.showProvinceBorders;
        map.showCountryBorders =
          command.showCountryBorders ?? map.showCountryBorders;
        map.showMapModeBorders =
          command.showMapModeBorders ?? map.showMapModeBorders;
        map.renderTerrain = command.renderTerrain ?? map.renderTerrain;

        if (
          map.renderTerrain &&
          !state.terrainImages &&
          state.terrainImageUrls
        ) {
          state.terrainImages = await loadTerrainImages(state.terrainImageUrls);
          map.updateTerrainTextures(state.terrainImages);
        }
        break;
      }
    }
  }
}

export function findProvince(e: MouseEvent, _map: MapToken) {
  return state.map!.findProvince(e);
}

export function proportionScale(_map: MapToken, proportion: number) {
  const map = state.map!;
  map.scale = map.maxScale * proportion;
}

export async function stash(_map: MapToken, { zoom }: { zoom: number }) {
  const map = state.map!;
  state.stash = {
    width: state.canvas!.width,
    height: state.canvas!.height,
    focusPoint: map.focusPoint,
    scale: map.scale,
  };

  map.focusPoint = [0, 0];
  map.scale = 1;
  map.resize(IMG_WIDTH / zoom, IMG_HEIGHT / zoom);
  await map.redrawViewport();
}

export function popStash(_map: MapToken) {
  if (!state.stash) {
    return;
  }

  const map = state.map!;
  map.focusPoint = state.stash.focusPoint;
  map.scale = state.stash.scale;
  state.canvas!.width = state.stash.width;
  state.canvas!.height = state.stash.height;
  state.stash = undefined;
}
