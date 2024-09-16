import {
  type BaseImageResourceUrls,
  type ShaderSourceUrls,
  type TerrainOverlayResourcesUrls,
} from "./types";

export async function fetchOk(...args: Parameters<typeof fetch>) {
  const resp = await fetch(...args);
  if (resp.status >= 400) {
    const body = await resp.text();
    throw new Error(`failed to fetch (${resp.status}): ${body}`);
  }

  return resp;
}

export async function loadShaders(sourceUrls: {
  map: ShaderSourceUrls;
  xbr: ShaderSourceUrls;
}) {
  return mapAsync(sourceUrls, (shader: ShaderSourceUrls) =>
    mapAsync(shader, (url: string) => fetchOk(url).then((x) => x.text())),
  );
}

async function mapAsync<RES, T extends Record<string, VAL>, VAL>(
  obj: T,
  fn: (val: VAL) => Promise<RES>,
) {
  const tasks = Object.entries(obj).map(([key, val]) =>
    fn(val).then((result) => [key, result] as const),
  );
  const entries = await Promise.all(tasks);
  return Object.fromEntries(entries) as { [K in keyof T]: RES };
}

async function loadImages<T extends Record<string, string>>(urls: T) {
  return mapAsync(urls, (x: string) => loadImage(x));
}

export async function loadBaseImages(urls: BaseImageResourceUrls) {
  return loadImages(urls);
}

export async function loadTerrainImages(urls: TerrainOverlayResourcesUrls) {
  return loadImages(urls);
}

export function provinceIdToColorIndexInvert(
  provinceIdToColorIndex: Uint16Array,
) {
  const colorIndexToProvinceId = new Uint16Array(provinceIdToColorIndex.length);
  for (let i = 0; i < provinceIdToColorIndex.length; i++) {
    colorIndexToProvinceId[provinceIdToColorIndex[i]] = i;
  }
  return colorIndexToProvinceId;
}

export async function loadImage(src: string): Promise<ImageBitmap> {
  // Download as blobs per this 2021-06-04 chromium comment:
  // https://bugs.chromium.org/p/chromium/issues/detail?id=580202#c53
  const image = await fetch(src).then((x) => x.blob());
  return createImageBitmap(image);
}
