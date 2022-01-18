import { defaultVersion, resources } from "@/lib/url_gen";
import type { StaticResources } from "../../../../map/staticResources";
import type { ShaderSource } from "../../../../map/types";
import { MapOnlyControls } from "../../types/map";

export interface Resources {
  static: StaticResources;
  provincesUniqueIndex: Uint16Array;
}

export async function shaderUrls(): Promise<ShaderSource[]> {
  const promises = {
    mapVertexShader: fetch(
      require(`../../../../../../map/assets/shaders/map.vert`)
    ).then((x) => x.text()),
    mapFargmentShader: fetch(
      require(`../../../../../../map/assets/shaders/map.frag`)
    ).then((x) => x.text()),
    xbrVertexShader: fetch(
      require(`../../../../../../map/assets/shaders/xbr.vert`)
    ).then((x) => x.text()),
    xbrFargmentShader: fetch(
      require(`../../../../../../map/assets/shaders/xbr.frag`)
    ).then((x) => x.text()),
  };

  return [
    {
      vertex: await promises.mapVertexShader,
      fragment: await promises.mapFargmentShader,
    },
    {
      vertex: await promises.xbrVertexShader,
      fragment: await promises.xbrFargmentShader,
    },
  ];
}

export async function resourceUrls(version: string): Promise<Resources> {
  const url = resources[version] ?? resources[defaultVersion];

  const promises = {
    provinces: loadImage(url.provinces),
    colorMap: loadImage(url.colorMap),
    sea: loadImage(url.sea),
    normal: loadImage(url.normal),
    terrain: loadImage(url.terrain),
    rivers: loadImage(url.rivers),
    stripes: loadImage(url.stripes),
    water: loadImage(url.water),
    surfaceRock: loadImage(url.surfaceRock),
    surfaceGreen: loadImage(url.surfaceGreen),
    surfaceNormalRock: loadImage(url.surfaceNormalRock),
    surfaceNormalGreen: loadImage(url.surfaceNormalGreen),
    heightmap: loadImage(url.heightmap),
    provincesUniqueColor: fetch(url.provincesUniqueColor)
      .then((x) => x.arrayBuffer())
      .then((x) => new Uint8Array(x)),
    provincesUniqueIndex: fetch(url.provincesUniqueIndex)
      .then((x) => x.arrayBuffer())
      .then((x) => new Uint16Array(x)),
  };

  return {
    static: {
      colorMap: await promises.colorMap,
      sea: await promises.sea,
      normal: await promises.normal,
      terrain: await promises.terrain,
      rivers: await promises.rivers,
      water: await promises.water,
      surfaceRock: await promises.surfaceRock,
      surfaceGreen: await promises.surfaceGreen,
      surfaceNormalRock: await promises.surfaceNormalRock,
      surfaceNormalGreen: await promises.surfaceNormalGreen,
      heightMap: await promises.heightmap,
      provinces: await promises.provinces,
      stripes: await promises.stripes,
      provincesUniqueColor: await promises.provincesUniqueColor,
    },
    provincesUniqueIndex: await promises.provincesUniqueIndex,
  };
}

async function loadImage(src: string): Promise<ImageBitmap> {
  // Download as blobs per this 2021-06-04 chronium comment:
  // https://bugs.chromium.org/p/chromium/issues/detail?id=580202#c53
  const image = await fetch(src).then((x) => x.blob());
  return createImageBitmap(image);
}

export function glContext(canvas: HTMLCanvasElement) {
  return canvas.getContext("webgl2", {
    alpha: true,
    depth: false,
    antialias: false,
    stencil: false,
  });
}

export function setMapControls(map: any, controls: MapOnlyControls) {
  map.showProvinceBorders = controls.showProvinceBorders;
  map.showMapModeBorders = controls.showMapModeBorders;
  map.showCountryBorders = controls.showCountryBorders;
  map.renderTerrain = controls.showTerrain;
}

export function provinceIdToColorIndexInvert(
  provinceIdToColorIndex: Uint16Array
) {
  const colorIndexToProvinceId = new Uint16Array(provinceIdToColorIndex.length);
  for (let i = 0; i < provinceIdToColorIndex.length; i++) {
    colorIndexToProvinceId[provinceIdToColorIndex[i]] = i;
  }
  return colorIndexToProvinceId;
}
