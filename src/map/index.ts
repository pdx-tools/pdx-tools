import { glContextOptions, WebGLMap } from "./src/map";
import {
  loadImage,
  type StaticResources, type TerrainOverlayResources,
} from "./src/staticResources";
import { GLResources } from "./src/glResources";
import { ProvinceFinder } from "./src/ProvinceFinder";
import { debounce } from "./src/debounce";
import { compileShaders } from "./src/shaderCompiler";
import type { OnScreenWegblContext, ShaderSource } from "./src/types";
import { MapShader } from "./src/mapShader";
import { XbrShader } from "./src/xbrShader";

async function fetchColorData(kind: string) {
  const raw = await fetch(`assets/game/eu4/data/color-${kind}-data.bin`).then(
    (x) => x.arrayBuffer()
  );
  const primary = new Uint8Array(raw, 0, raw.byteLength / 2);
  const secondary = new Uint8Array(raw, raw.byteLength / 2);
  return [primary, secondary];
}

async function loadStaticResources(): Promise<StaticResources> {
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

async function loadTerrainResources(): Promise<TerrainOverlayResources> {
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

async function loadShaderSource(name: string): Promise<ShaderSource> {
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


async function main() {
  const container = document.querySelector<HTMLElement>("#canvasContainer")!;
  const controls = document.querySelector<HTMLElement>("#canvasControls")!;
  const selectedEl = document.querySelector("#selected-province-id")!;
  const hoveredEl = document.querySelector("#hovered-province-id")!;
  const renderEl = document.querySelector("#render-time")!;

  const canvas = document!.querySelector("#canvas") as HTMLCanvasElement;
  const glc = canvas!.getContext("webgl2", glContextOptions());
  if (glc === null) {
    return;
  }

  const provinceUniqueIndex = await fetch(
    "assets/game/eu4/data/color-index.bin"
  ).then((x) => x.arrayBuffer());

  const gl = glc as OnScreenWegblContext;

  const shaderPromise = Promise.all([
    loadShaderSource("map"),
    loadShaderSource("xbr"),
  ]);

  const staticResourcesPromise = loadStaticResources();
  const compilation = compileShaders(gl, await shaderPromise);

  const [primaryPoliticalColors, secondaryPoliticalColors] =
    await fetchColorData("political");
  const [primaryPoliticalPlayerColors, secondaryPoliticalPlayerColors] =
    await fetchColorData("political-player");
  const [primaryReligionColors, secondaryReligionColors] = await fetchColorData(
    "religion"
  );
  const [primaryReligionPlayerColors, secondaryReligionPlayerColors] =
    await fetchColorData("religion-player");

  const staticResources = await staticResourcesPromise;
  const glResourcesInit = GLResources.create(
    gl,
    staticResources,
  );
  const [mapProgram, xbrProgram] = compilation.linked();
  const glResources = new GLResources(
    ...glResourcesInit,
    MapShader.create(gl, mapProgram),
    XbrShader.create(gl, xbrProgram)
  );

  const finder = new ProvinceFinder(
    staticResources.provinces1,
    staticResources.provinces2,
    staticResources.provincesUniqueColor,
    new Uint16Array(provinceUniqueIndex)
  );
  const map = WebGLMap.create(glResources, finder);
  map.updateTerrainTextures(await loadTerrainResources());
  map.onProvinceSelection = (e) => (selectedEl.textContent = e.toString());
  map.onProvinceHover = (e) => (hoveredEl.textContent = e.toString());
  map.onDraw = (e) => {
    let cancellations = ``;
    if (e.mapDrawsQueued != 0 ||e.viewportDrawsQueued != 0) {
      cancellations += `(queued: viewport ${e.viewportDrawsQueued} / redraw ${e.mapDrawsQueued}) `;
    }
    console.log(
      `Canvas content redrawn ${cancellations}in: ${e.elapsedMs.toFixed(2)}ms`
    );
    renderEl.textContent = `${e.elapsedMs.toFixed(2)}ms`;
  };

  map.updateProvinceColors(primaryPoliticalColors, secondaryPoliticalColors);

  let primaryPointer: PointerEvent | null = null;
  let secondaryPointer: PointerEvent | null = null;
  let pointerDiff = 0;

  function moveCamera(e: MouseEvent) {
    map.moveCamera(e);
    map.redrawViewport();
  }

  function handleMouseUp(e: MouseEvent) {
    map.onMouseUp(e);
    window.removeEventListener("pointermove", moveCamera);
    window.removeEventListener("pointerup", handleMouseUp);
  }

  function pinchMove(e: PointerEvent) {
    if (e.pointerId == primaryPointer?.pointerId) {
      primaryPointer = e;
    } else if (e.pointerId == secondaryPointer?.pointerId) {
      secondaryPointer = e;
    }

    if (!primaryPointer || !secondaryPointer) {
      return;
    }

    const a = primaryPointer;
    const b = secondaryPointer;

    const dist = Math.sqrt(
      (b.clientX - a.clientX) ** 2 + (b.clientY - a.clientY) ** 2
    );

    if (pointerDiff != 0) {
      const midpoint = {
        clientX: (a.clientX + b.clientX) / 2,
        clientY: (a.clientY + b.clientY) / 2,
      };

      map.onWheel({
        ...midpoint,
        deltaY: pointerDiff - dist,
      });
      map.redrawViewport();
    }

    pointerDiff = dist;
  }

  function pinchUp(e: PointerEvent) {
    if (e.pointerId == primaryPointer?.pointerId) {
      primaryPointer = null;
    } else if (e.pointerId == secondaryPointer?.pointerId) {
      secondaryPointer = null;
    }

    map.redrawViewport();
    window.removeEventListener("pointermove", pinchMove);
    window.removeEventListener("pointerup", pinchUp);
  }

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (e.button <= 1) {
      if (e.isPrimary) {
        primaryPointer = e;
        map.onMouseDown(e);
        window.addEventListener("pointermove", moveCamera);
        window.addEventListener("pointerup", handleMouseUp);
      } else {
        secondaryPointer = e;
        window.removeEventListener("pointermove", moveCamera);
        window.removeEventListener("pointerup", handleMouseUp);
        window.addEventListener("pointermove", pinchMove);
        window.addEventListener("pointerup", pinchUp);
      }
    }
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    map.onWheel(e);
    map.redrawViewport();
  });

  function mapModeChange(value: string) {
    localStorage.setItem("mapMode", value);
    switch (value) {
      case "political": {
        map.updateProvinceColors(
          primaryPoliticalColors,
          secondaryPoliticalColors
        );
        break;
      }
      case "political-player": {
        map.updateProvinceColors(
          primaryPoliticalPlayerColors,
          secondaryPoliticalPlayerColors
        );
        break;
      }
      case "religion": {
        map.updateProvinceColors(
          primaryReligionColors,
          secondaryReligionColors
        );
        break;
      }
      case "religion-player": {
        map.updateProvinceColors(
          primaryReligionPlayerColors,
          secondaryReligionPlayerColors
        );
        break;
      }
      case "terrain": {
        const provinces = staticResources.provincesUniqueColor.length / 3;
        const newColor = new Uint8Array(provinces * 4);
        map.updateProvinceColors(newColor, newColor);
        break;
      }
    }
  }

  function mapModeHandler(this: HTMLInputElement, _e: Event) {
    mapModeChange(this.value);
    map.redrawMap();
  }

  function provinceBordersHandler(this: HTMLInputElement, _e: Event) {
    map.showProvinceBorders = this.checked;
    localStorage.setItem("showProvinceBorders", JSON.stringify(this.checked));
    map.redrawMap();
  }

  function countryBordersHandler(this: HTMLInputElement, _e: Event) {
    map.showCountryBorders = this.checked;
    localStorage.setItem("showCountryBorders", JSON.stringify(this.checked));
    map.redrawMap();
  }

  function mapBordersHandler(this: HTMLInputElement, _e: Event) {
    map.showMapModeBorders = this.checked;
    localStorage.setItem("showMapModeBorders", JSON.stringify(this.checked));
    map.redrawMap();
  }

  function renderTerrainHandler(this: HTMLInputElement, _e: Event) {
    map.renderTerrain = this.checked;
    localStorage.setItem("renderTerrain", JSON.stringify(this.checked));
    map.redrawViewport();
  }

  function downloadImage(data: Blob | null, extension: string) {
    if (!data) {
      return;
    }

    const link = document.createElement("a");
    link.style.display = "none";
    document.body.append(link);
    link.href = URL.createObjectURL(data);
    link.download = `map.${extension}`;
    link.click();
    URL.revokeObjectURL(link.href);
    link.remove();
  }

  async function exportImageHandler() {
    await map.redrawMap();
    canvas.toBlob((data) => downloadImage(data, "png"));
  }

  function resizeHandler() {
    map.resize(container.clientWidth, container.clientHeight);
    map.redrawViewport();
  }

  const politicalMapModeEl =
    document.querySelector<HTMLInputElement>("#political")!;
  politicalMapModeEl.addEventListener("change", mapModeHandler);

  const politicalPlayerMapModeEl =
    document.querySelector<HTMLInputElement>("#political-player")!;
  politicalPlayerMapModeEl.addEventListener("change", mapModeHandler);

  const religionMapModeEl =
    document.querySelector<HTMLInputElement>("#religion")!;
  religionMapModeEl.addEventListener("change", mapModeHandler);

  const religionPlayerMapModeEl =
    document.querySelector<HTMLInputElement>("#religion-player")!;
  religionPlayerMapModeEl.addEventListener("change", mapModeHandler);

  const terrainMapModeEl =
    document.querySelector<HTMLInputElement>("#terrain")!;
  terrainMapModeEl.addEventListener("change", mapModeHandler);

  const provinceBordersEl =
    document.querySelector<HTMLInputElement>("#province-borders")!;
  provinceBordersEl.addEventListener("change", provinceBordersHandler);

  const countryBordersEl =
    document.querySelector<HTMLInputElement>("#country-borders")!;
  countryBordersEl.addEventListener("change", countryBordersHandler);

  const mapModeBordersEl =
    document.querySelector<HTMLInputElement>("#map-mode-borders")!;
  mapModeBordersEl.addEventListener("change", mapBordersHandler);

  const renderTerrainEl =
    document.querySelector<HTMLInputElement>("#render-terrain")!;
  renderTerrainEl.addEventListener("change", renderTerrainHandler);

  document
    .querySelector("#btn-export")!
    .addEventListener("click", exportImageHandler);

  const zoomInEl = document.querySelector<HTMLButtonElement>("#btn-zoom-in")!;
  zoomInEl.addEventListener("click", () => {
    map.zoomIn();
    map.redrawViewport();
  });

  const zoomOutEl = document.querySelector<HTMLButtonElement>("#btn-zoom-out")!;
  zoomOutEl.addEventListener("click", () => {
    map.zoomOut();
    map.redrawViewport();
  });

  function exportType() {
    if (map.renderTerrain) {
      return "webp";
    } else {
      return "png";
    }
  }

  function exporter(scale: number) {
    return async () => {
      const extension = exportType();
      const data = await map.mapData(scale, `image/${extension}`);
      downloadImage(data, extension);
    };
  }

  document
    .querySelector("#btn-full-export-1x")!
    .addEventListener("click", exporter(1));

  document
    .querySelector("#btn-full-export-2x")!
    .addEventListener("click", exporter(2));

  document
    .querySelector("#btn-full-export-3x")!
    .addEventListener("click", exporter(3));

  const storedMapMode = localStorage.getItem("mapMode");
  const storedShowProvinceBorders = localStorage.getItem("showProvinceBorders");
  const storedShowCountryBorders = localStorage.getItem("showCountryBorders");
  const storedmapModeBorders = localStorage.getItem("showMapModeBorders");
  const storedRenderTerrain = localStorage.getItem("renderTerrain");

  switch (storedMapMode) {
    case "political": {
      politicalMapModeEl.checked = true;
      mapModeChange(storedMapMode);
      break;
    }
    case "political-player": {
      politicalPlayerMapModeEl.checked = true;
      mapModeChange(storedMapMode);
      break;
    }
    case "religion": {
      religionMapModeEl.checked = true;
      mapModeChange(storedMapMode);
      break;
    }
    case "religion-player": {
      religionPlayerMapModeEl.checked = true;
      mapModeChange(storedMapMode);
      break;
    }
    case "terrain": {
      terrainMapModeEl.checked = true;
      mapModeChange(storedMapMode);
      break;
    }
  }

  if (storedShowProvinceBorders) {
    const val = JSON.parse(storedShowProvinceBorders);
    provinceBordersEl.checked = map.showProvinceBorders = val;
  }

  if (storedShowCountryBorders) {
    const val = JSON.parse(storedShowCountryBorders);
    countryBordersEl.checked = map.showCountryBorders = val;
  }

  if (storedmapModeBorders) {
    const val = JSON.parse(storedmapModeBorders);
    mapModeBordersEl.checked = map.showMapModeBorders = val;
  }

  if (storedRenderTerrain) {
    const val = JSON.parse(storedRenderTerrain);
    renderTerrainEl.checked = map.renderTerrain = val;
  }

  map.redrawMap();
  const debounceResize = debounce(() => resizeHandler(), 100);

  let firstResize = true;
  const ro = new ResizeObserver((_entries) => {
    if (firstResize) {
      firstResize = false;
      resizeHandler();
      controls.style.display = "unset";
    } else {
      debounceResize();
    }
  });
  ro.observe(container);
}

window.addEventListener("load", () => {
  main();
});
