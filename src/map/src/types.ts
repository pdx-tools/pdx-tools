export type StaticResources = BaseImageResources & {
  provincesUniqueColor: Uint8Array;
};

export type StaticResourceUrls = { [K in keyof StaticResources]: string };

export type BaseImageResources = {
  provinces1: ImageBitmap;
  provinces2: ImageBitmap;
  terrain1: ImageBitmap;
  terrain2: ImageBitmap;
  stripes: ImageBitmap;
};

export type BaseImageResourceUrls = { [K in keyof BaseImageResources]: string };

export type TerrainOverlayResources = {
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
};

export type TerrainOverlayResourcesUrls = {
  [K in keyof TerrainOverlayResources]: string;
};

export type ShaderSource = {
  vertex: string;
  fragment: string;
};
export type ShaderSourceUrls = ShaderSource;
