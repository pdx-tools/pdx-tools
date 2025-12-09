import { wrap, transfer } from "comlink";
import { MapController } from "./src/MapController";
import { createMapWorker } from "./src";
import type { MapWorker } from "./src";
import mapVertex from "./assets/shaders/map.vert?url";
import mapFragment from "./assets/shaders/map.frag?url";
import xbrVertex from "./assets/shaders/xbr.vert?url";
import xbrFragment from "./assets/shaders/xbr.frag?url";
import provinces1 from "./assets/game/eu4/images/provinces-1.webp?url";
import provinces2 from "./assets/game/eu4/images/provinces-2.webp?url";
import terrain1 from "./assets/game/eu4/images/terrain-1.webp?url";
import terrain2 from "./assets/game/eu4/images/terrain-2.webp?url";
import stripes from "./assets/game/eu4/images/stripes.webp?url";
import colorOrderData from "./assets/game/eu4/data/color-order.bin?url";
import colorIndexData from "./assets/game/eu4/data/color-index.bin?url";
import colorMap from "./assets/game/eu4/images/colormap.webp?url";
import seaImage from "./assets/game/eu4/images/sea-image.webp?url";
import worldNormal from "./assets/game/eu4/images/world_normal.webp?url";
import rivers1 from "./assets/game/eu4/images/rivers-1.webp?url";
import rivers2 from "./assets/game/eu4/images/rivers-2.webp?url";
import water from "./assets/game/eu4/images/water.webp?url";
import surfaceRock from "./assets/game/eu4/images/surface_rock.webp?url";
import surfaceGreen from "./assets/game/eu4/images/surface_green.webp?url";
import surfaceNormalRock from "./assets/game/eu4/images/surface_normal_rock.webp?url";
import surfaceNormalGreen from "./assets/game/eu4/images/surface_normal_green.webp?url";
import heightMap from "./assets/game/eu4/images/heightmap.webp?url";

async function fetchColorData(kind: string) {
  const raw = await fetch(`assets/game/eu4/data/color-${kind}-data.bin`).then(
    (x) => x.arrayBuffer(),
  );
  const primary = new Uint8Array(raw, 0, raw.byteLength / 2);
  const secondary = new Uint8Array(raw, raw.byteLength / 2);
  return [primary, secondary];
}

const baseImageUrls = {
  provinces1,
  provinces2,
  terrain1,
  terrain2,
  stripes,
};

const provincesUniqueColorUrl = colorOrderData;
const provincesUniqueIndexUrl = colorIndexData;

const terrainUrls = {
  colorMap,
  sea: seaImage,
  normal: worldNormal,
  rivers1,
  rivers2,
  water,
  surfaceRock,
  surfaceGreen,
  surfaceNormalRock,
  surfaceNormalGreen,
  heightMap,
};

const shaderUrls = {
  map: {
    vertex: mapVertex,
    fragment: mapFragment,
  },
  xbr: {
    vertex: xbrVertex,
    fragment: xbrFragment,
  },
};

async function main() {
  const container = document.querySelector<HTMLElement>("#canvasContainer")!;
  const selectedEl = document.querySelector("#selected-province-id")!;
  const hoveredEl = document.querySelector("#hovered-province-id")!;
  const renderEl = document.querySelector("#render-time")!;

  const storedMapMode = localStorage.getItem("mapMode");
  const storedShowProvinceBorders = localStorage.getItem("showProvinceBorders");
  const storedShowCountryBorders = localStorage.getItem("showCountryBorders");
  const storedmapModeBorders = localStorage.getItem("showMapModeBorders");
  const storedRenderTerrain = localStorage.getItem("renderTerrain");

  const initial = {
    showProvinceBorders: storedShowProvinceBorders
      ? JSON.parse(storedShowProvinceBorders)
      : undefined,
    showCountryBorders: storedShowCountryBorders
      ? JSON.parse(storedShowCountryBorders)
      : undefined,
    showMapModeBorders: storedmapModeBorders
      ? JSON.parse(storedmapModeBorders)
      : undefined,
    renderTerrain: storedRenderTerrain
      ? JSON.parse(storedRenderTerrain)
      : undefined,
  } as const;

  const canvas = document!.querySelector("#canvas") as HTMLCanvasElement;
  const bounds = container.getBoundingClientRect();
  canvas.width = bounds.width * window.devicePixelRatio;
  canvas.height = bounds.height * window.devicePixelRatio;
  canvas.style.width = `${bounds.width}px`;
  canvas.style.height = `${bounds.height}px`;

  const offscreen = canvas.transferControlToOffscreen();
  const worker = wrap<MapWorker>(createMapWorker());

  const mapTask = Promise.all([
    worker.init(transfer(offscreen, [offscreen]), shaderUrls),
    worker.withResources(
      baseImageUrls,
      provincesUniqueColorUrl,
      provincesUniqueIndexUrl,
    ),
    worker.withTerrainImages(terrainUrls, {
      eager: initial.renderTerrain ?? false,
    }),
  ])
    .then(([init, resources, terrain]) =>
      worker.withMap(window.devicePixelRatio, init, resources, terrain),
    )
    .then((map) => new MapController(worker, map, canvas, container));

  const [map, [primaryPoliticalColors, secondaryPoliticalColors]] =
    await Promise.all([mapTask, fetchColorData("political")]);

  map.attachDOMHandlers();
  map.register({
    onProvinceHover: (e) => (hoveredEl.textContent = e.toString()),
    onProvinceSelect: (e) => {
      selectedEl.textContent = e.provinceId.toString();
      map.highlightProvince(e);
    },
    onDraw: (e) => {
      let cancellations = ``;
      if (e.mapDrawsQueued != 0 || e.viewportDrawsQueued != 0) {
        cancellations += `(queued: viewport ${e.viewportDrawsQueued} / redraw ${e.mapDrawsQueued}) `;
      }
      console.log(
        `Canvas content redrawn ${cancellations}in: ${e.elapsedMs.toFixed(2)}ms`,
      );
      renderEl.textContent = `${e.elapsedMs.toFixed(2)}ms`;
    },
  });
  map.updateProvinceColors(primaryPoliticalColors, secondaryPoliticalColors, {
    country: primaryPoliticalColors,
  });
  map.update(initial);
  map.redrawMap();

  async function mapModeChange(value: string) {
    localStorage.setItem("mapMode", value);
    switch (value) {
      case "political": {
        const [primaryPoliticalColors, secondaryPoliticalColors] =
          await fetchColorData("political");
        map.updateProvinceColors(
          primaryPoliticalColors,
          secondaryPoliticalColors,
          { draw: true },
        );
        break;
      }
      case "political-player": {
        const [primaryPoliticalPlayerColors, secondaryPoliticalPlayerColors] =
          await fetchColorData("political-player");
        map.updateProvinceColors(
          primaryPoliticalPlayerColors,
          secondaryPoliticalPlayerColors,
          { draw: true },
        );
        break;
      }
      case "religion": {
        const [primaryReligionColors, secondaryReligionColors] =
          await fetchColorData("religion");
        map.updateProvinceColors(
          primaryReligionColors,
          secondaryReligionColors,
          { draw: true },
        );
        break;
      }
      case "religion-player": {
        const [primaryReligionPlayerColors, secondaryReligionPlayerColors] =
          await fetchColorData("religion-player");
        map.updateProvinceColors(
          primaryReligionPlayerColors,
          secondaryReligionPlayerColors,
          { draw: true },
        );
        break;
      }
    }
  }

  function mapModeHandler(this: HTMLInputElement, _e: Event) {
    mapModeChange(this.value);
  }

  function provinceBordersHandler(this: HTMLInputElement, _e: Event) {
    map.update({ showProvinceBorders: this.checked }, { draw: true });
    localStorage.setItem("showProvinceBorders", JSON.stringify(this.checked));
  }

  function countryBordersHandler(this: HTMLInputElement, _e: Event) {
    map.update({ showCountryBorders: this.checked }, { draw: true });
    localStorage.setItem("showCountryBorders", JSON.stringify(this.checked));
  }

  function mapBordersHandler(this: HTMLInputElement, _e: Event) {
    map.update({ showMapModeBorders: this.checked }, { draw: true });
    localStorage.setItem("showMapModeBorders", JSON.stringify(this.checked));
  }

  function renderTerrainHandler(this: HTMLInputElement, _e: Event) {
    map.update({ renderTerrain: this.checked }, { draw: true });
    localStorage.setItem("renderTerrain", JSON.stringify(this.checked));
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
    const data = await map.screenshot({ kind: "viewport" });
    downloadImage(data, "png");
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
  });

  const zoomOutEl = document.querySelector<HTMLButtonElement>("#btn-zoom-out")!;
  zoomOutEl.addEventListener("click", () => {
    map.zoomOut();
  });

  function exporter(scale: number) {
    return async () => {
      const data = await map.screenshot({ kind: "world", scale });
      downloadImage(data, "png");
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
  }

  provinceBordersEl.checked = initial.showProvinceBorders ?? false;
  countryBordersEl.checked = initial.showCountryBorders ?? false;
  mapModeBordersEl.checked = initial.showMapModeBorders ?? false;
  renderTerrainEl.checked = initial.renderTerrain ?? false;
}

window.addEventListener("load", () => {
  main();
});
