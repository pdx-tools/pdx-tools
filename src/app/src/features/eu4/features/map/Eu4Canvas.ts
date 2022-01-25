import { GLResources } from "../../../../map/glResources";
import {
  IMG_HEIGHT,
  IMG_WIDTH,
  MouseEvent,
  WebGLMap,
  WheelEvent,
} from "../../../../map/map";
import { ProvinceFinder } from "../../../../map/ProvinceFinder";
import { compile } from "../../../../map/shaderCompiler";
import { SavegameVersion } from "../../types/models";
import { timeit } from "../../../engine/worker/worker-lib";
import { AnalyzeEvent } from "../../../engine/worker/worker-types";
import { MapOnlyControls } from "../../types/map";
import {
  provinceIdToColorIndexInvert,
  Resources,
  resourceUrls,
  setMapControls,
  shaderUrls,
} from "./resources";

interface FocusCameraOnProps {
  offsetX: number;
  width: number;
  height: number;
}

export class Eu4Canvas {
  private resources?: Resources;
  private linkedPrograms?: () => Promise<WebGLProgram[]>;
  public map: WebGLMap | undefined;

  private loadedVersion: SavegameVersion | undefined;

  public constructor(private readonly gl: WebGL2RenderingContext) {}

  async initializeAssetsFromVersion(
    saveVersion: SavegameVersion,
    onProgress: (event: AnalyzeEvent) => void
  ) {
    if (
      saveVersion.first == this.loadedVersion?.first &&
      saveVersion.second == this.loadedVersion?.second
    ) {
      // 1.31 and 1.32 share same map asset
      return (
        [saveVersion.second, this.loadedVersion?.second].filter(
          (x) => x == 31 || x == 32
        ).length == 2
      );
    }

    const version = `${saveVersion.first}.${saveVersion.second}`;
    const compilePromise = timeit(shaderUrls).then(
      async ([shaders, elapsedMs]) => {
        onProgress({
          kind: "incremental progress",
          msg: "shaders fetched",
          percent: 3,
          elapsedMs,
        });
        var [linkage, elapsedMs] = await timeit(() =>
          compile(this.gl, shaders)
        );
        onProgress({
          kind: "incremental progress",
          msg: "shaders compiled",
          percent: 3,
          elapsedMs,
        });
        var [linked, elapsedMs] = await timeit(linkage);
        onProgress({
          kind: "incremental progress",
          msg: "shaders linked",
          percent: 4,
          elapsedMs,
        });
        return linked;
      }
    );

    var [resources, elapsedMs] = await timeit(() => resourceUrls(version));
    onProgress({
      kind: "incremental progress",
      msg: "textures fetched and bitmapped",
      percent: 10,
      elapsedMs,
    });

    this.resources = resources;
    this.linkedPrograms = () => compilePromise;
    return true;
  }

  async setupRenderer(primaryCountryColors: Uint8Array) {
    if (!this.resources || !this.linkedPrograms) {
      throw new Error("programmer error, resources can't be false");
    }

    const resources = this.resources;
    const colorIndexToProvinceId = provinceIdToColorIndexInvert(
      resources.provincesUniqueIndex
    );
    const finder = new ProvinceFinder(
      resources.static.provinces,
      resources.static.provincesUniqueColor,
      colorIndexToProvinceId
    );

    const glResources = await GLResources.create(
      this.gl,
      resources.static,
      this.linkedPrograms,
      primaryCountryColors
    );

    const map = WebGLMap.create(glResources, finder);

    this.map = map;

    this.resources = undefined;
    this.linkedPrograms = undefined;
  }

  cameraFromDimesions([width, height]: number[], [x, y]: number[]) {
    this.focusCameraOn([x, y], {
      width,
      height,
    });

    const initialScale = 10000 / width;

    if (!this.map) {
      throw new Error("map needs to be setup before calling the camera");
    }

    this.map.scale = initialScale;
  }

  focusCameraOn([x, y]: number[], options?: Partial<FocusCameraOnProps>) {
    if (!this.map) {
      throw new Error("map needs to be setup before calling the camera");
    }

    const width = options?.width ?? this.gl.canvas.width;
    const height = options?.height ?? this.gl.canvas.height;

    const IMG_ASPECT = IMG_WIDTH / IMG_HEIGHT;
    const initX = ((x - IMG_WIDTH / 2) / (IMG_WIDTH / 2)) * (width / 2);
    const initY =
      (((y - IMG_HEIGHT / 2) / (IMG_HEIGHT / 2)) * (height / 2)) /
      (IMG_ASPECT / (width / height));

    this.map.focusPoint = [initX, initY];

    if (options?.offsetX) {
      this.map.focusPoint[0] = initX + options.offsetX / 2 / this.map.scale;
    }
  }

  provinceIdToColorIndex(): Promise<Uint16Array> {
    if (!this.resources) {
      throw new Error("programmer error, resources can't be false");
    }

    return Promise.resolve(this.resources.provincesUniqueIndex.slice());
  }

  // WebGL map already handles this for us
  handleMouseMove(e: MouseEvent) {}

  onMouseDown(e: MouseEvent) {
    this.map?.onMouseDown(e);
  }
  onMouseUp(e: MouseEvent) {
    this.map?.onMouseUp(e);
  }
  moveCamera(e: MouseEvent) {
    this.map?.moveCamera(e);
  }
  onWheel(e: WheelEvent) {
    this.map?.onWheel(e);
  }

  redrawMapImage() {
    this.map?.redrawMapImage();
  }

  redrawViewport() {
    this.map?.redrawViewport();
  }

  resize(width: number, height: number) {
    this.gl.canvas.width = width;
    this.gl.canvas.height = height;
    this.redrawViewport();
  }

  mapData(scale: number, type: string) {
    if (this.map) {
      return this.map.mapData(scale, type);
    } else {
      return Promise.resolve(null);
    }
  }

  setControls(controls: MapOnlyControls) {
    if (this.map) {
      setMapControls(this.map, controls);
    }
  }

  close() {}
}
