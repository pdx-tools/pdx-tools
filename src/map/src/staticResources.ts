import { ShaderSource } from "./types";

// Stores all static resource data like images, shader source code, etc.
export interface StaticResources {
  colorMap: ImageBitmap;
  sea: ImageBitmap;
  normal: ImageBitmap;
  terrain: ImageBitmap;
  rivers: ImageBitmap;
  water: ImageBitmap;
  provinces: ImageBitmap;
  stripes: ImageBitmap;
  surfaceRock: ImageBitmap;
  surfaceGreen: ImageBitmap;
  surfaceNormalRock: ImageBitmap;
  surfaceNormalGreen: ImageBitmap;
  heightMap: ImageBitmap;
  provincesUniqueColor: Uint8Array;
}

export async function loadStaticResources(): Promise<StaticResources> {
  const provincesBufferPromise = fetch(
    "assets/game/eu4/data/color-order.bin"
  ).then((x) => x.arrayBuffer());

  const [
    colorMap,
    sea,
    normal,
    terrain,
    rivers,
    water,
    provinces,
    stripes,
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
      "./assets/game/eu4/images/terrain.png",
      "./assets/game/eu4/images/rivers.png",
      "./assets/game/eu4/images/water.webp",
      "./assets/game/eu4/images/provinces.png",
      "./assets/game/eu4/images/stripes.png",
      "./assets/game/eu4/images/surface_rock.webp",
      "./assets/game/eu4/images/surface_green.webp",
      "./assets/game/eu4/images/surface_normal_rock.webp",
      "./assets/game/eu4/images/surface_normal_green.webp",
      "./assets/game/eu4/images/heightmap.webp",
    ].map(loadImage)
  );

  const provincesUniqueColor = new Uint8Array(await provincesBufferPromise);

  return {
    colorMap,
    sea,
    normal,
    terrain,
    rivers,
    water,
    provinces,
    stripes,
    surfaceRock,
    surfaceGreen,
    surfaceNormalRock,
    surfaceNormalGreen,
    heightMap,
    provincesUniqueColor,
  };
}

async function loadImage(src: string): Promise<ImageBitmap> {
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
