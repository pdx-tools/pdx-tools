import { ShaderSource } from "./types";

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

export async function loadStaticResources(): Promise<StaticResources> {
  const provincesBufferPromise = fetch(
    "assets/game/eu4/data/color-order.bin"
  ).then((x) => x.arrayBuffer());

  const [terrain1, terrain2, provinces1, provinces2, stripes] =
    await Promise.all(
      [
        "./assets/game/eu4/images/terrain-1.png",
        "./assets/game/eu4/images/terrain-2.png",
        "./assets/game/eu4/images/provinces-1.png",
        "./assets/game/eu4/images/provinces-2.png",
        "./assets/game/eu4/images/stripes.png",
      ].map(loadImage)
    );

  const provincesUniqueColor = new Uint8Array(await provincesBufferPromise);

  return {
    provinces1,
    provinces2,
    terrain1,
    terrain2,
    provincesUniqueColor,
    stripes,
  };
}

export async function loadTerrainResources(): Promise<TerrainOverlayResources> {
  const [
    colorMap,
    sea,
    normal,
    rivers1,
    rivers2,
    water,
    surfaceRock,
    surfaceGreen,
    surfaceNormalRock,
    surfaceNormalGreen,
    heightMap,
  ] = await Promise.all(
    [
      "./assets/game/eu4/images/colormap.webp",
      "./assets/game/eu4/images/sea-image.webp",
      "./assets/game/eu4/images/world_normal.webp",
      "./assets/game/eu4/images/rivers-1.png",
      "./assets/game/eu4/images/rivers-2.png",
      "./assets/game/eu4/images/water.webp",
      "./assets/game/eu4/images/surface_rock.webp",
      "./assets/game/eu4/images/surface_green.webp",
      "./assets/game/eu4/images/surface_normal_rock.webp",
      "./assets/game/eu4/images/surface_normal_green.webp",
      "./assets/game/eu4/images/heightmap.webp",
    ].map(loadImage)
  );

  return {
    colorMap,
    sea,
    normal,
    rivers1,
    rivers2,
    water,
    surfaceRock,
    surfaceGreen,
    surfaceNormalRock,
    surfaceNormalGreen,
    heightMap,
  };
}

export async function loadImage(src: string): Promise<ImageBitmap> {
  // Download as blobs per this 2021-06-04 chronium comment:
  // https://bugs.chromium.org/p/chromium/issues/detail?id=580202#c53
  const image = await fetch(src).then((x) => x.blob());
  return createImageBitmap(image);
}

export async function loadShaderSource(name: string): Promise<ShaderSource> {
  const vertexFetch = fetch(`./assets/shaders/${name}.vert`).then((x) =>
    x.text()
  );
  const fragmentFetch = fetch(`./assets/shaders/${name}.frag`).then((x) =>
    x.text()
  );

  const [vertex, fragment] = await Promise.all([vertexFetch, fragmentFetch]);
  return {
    vertex,
    fragment,
  };
}
