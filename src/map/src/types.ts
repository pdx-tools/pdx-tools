export type StaticResources = BaseImageResources & ProvinceLocationResources;

export type BaseImageResources = {
  terrain1: ImageBitmap;
  terrain2: ImageBitmap;
  stripes: ImageBitmap;
};

export type BaseImageResourceUrls = { [K in keyof BaseImageResources]: string };

export type ProvinceLocationResources = {
  provinceLocations1: Uint16Array;
  provinceLocations2: Uint16Array;
  colorIndexToProvinceId: Uint16Array;
  provinceLocationsWidth: number;
  provinceLocationsHeight: number;
};

export type ProvinceLocationUrls = {
  provinceLocations1: string;
  provinceLocations2: string;
  provinceIdToColorIndex: string;
};

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
