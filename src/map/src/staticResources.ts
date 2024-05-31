// Stores all static resource data like images, shader source code, etc.
export interface StaticResources {
  provinces1: ImageBitmap;
  provinces2: ImageBitmap;
  terrain1: ImageBitmap;
  terrain2: ImageBitmap;
  provincesUniqueColor: Uint8Array;
  stripes: ImageBitmap;
}

export interface TerrainOverlayResources {
  colorMap: ImageBitmap;
  sea: ImageBitmap;
  normal: ImageBitmap;
  rivers1: ImageBitmap;
  rivers2: ImageBitmap;
  water: ImageBitmap;
  surfaceRock: ImageBitmap;
  surfaceGreen: ImageBitmap;
  surfaceNormalRock: ImageBitmap;
  surfaceNormalGreen: ImageBitmap;
  heightMap: ImageBitmap;
}

export async function loadImage(src: string): Promise<ImageBitmap> {
  // Download as blobs per this 2021-06-04 chromium comment:
  // https://bugs.chromium.org/p/chromium/issues/detail?id=580202#c53
  const image = await fetch(src).then((x) => x.blob());
  return createImageBitmap(image);
}
