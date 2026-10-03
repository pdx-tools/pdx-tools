import { wrap, transfer, proxy, releaseProxy } from "comlink";
import type { Remote } from "comlink";
import type {
  GradientConfig,
  GradientPalette,
  DisplayData,
  MapMode,
  SelectionSummaryData,
  CountryPopulationProfile,
  CountryProfile,
  MarketProfile,
  LocationProfile,
  MarketProductionLocationSummary,
  DevelopmentInsightData,
  WealthInsightData,
  WealthScope,
  UnrealizedTaxBaseInsightData,
  UnrealizedTaxBaseScope,
  MarketInsightData,
  ScopedGoodSummary,
  PopulationInsightData,
  PopulationGrowthInsightData,
  BuildingLevelsInsightData,
  ReligionInsightData,
  RgoInsightData,
  ControlInsightData,
  PoliticalWorldScoreboard,
  Eu5DateComponents,
  TimelineChange,
  TimelineData,
} from "@/wasm/wasm_eu5";
import type { Eu5SaveData } from "./store/types";
import type { Eu5MapHoverTarget } from "./useEu5MapHoverTarget";
import { fetchOk } from "@/lib/fetch";
import { check } from "@/lib/isPresent";
import { getLogLevel } from "@/lib/isDeveloper";
import { trackWorker } from "@/lib/sentryWorker";
import type * as Eu5WorkerModuleDefinition from "./workers/game/game-module";
import type * as Eu5MapWorkerModuleDefinition from "./workers/map/map-module";
import type { SharedCanvasInputConfig } from "@/lib/canvas_courier";
import type { BoxSelectOverlayRect } from "./types/box-select";
import type { CursorHint } from "./workers/map/map-module";
import type {
  DatePlateColors,
  DatePlateFonts,
  MapViewport,
  TimelapseFile,
  TimelapseFraming,
  TimelapseFrameLayout,
  TimelapseFrameTiming,
} from "@pdx.tools/timelapse";

const gameZipUrls = import.meta.glob<true, string, string>(
  "../../../../../assets/game/eu5/*/game.zip",
  { query: "?url", eager: true, import: "default" },
);

const mapZipUrls = import.meta.glob<true, string, string>(
  "../../../../../assets/game/eu5/*/map.zip",
  { query: "?url", eager: true, import: "default" },
);

const locZipUrls = import.meta.glob<true, string, string>(
  "../../../../../assets/game/eu5/*/loc-en.zip",
  { query: "?url", eager: true, import: "default" },
);

type BundleVersion = { version: string; major: number; minor: number };

function parseBundleVersion(version: string): BundleVersion | null {
  const match = /^(\d+)\.(\d+)$/.exec(version);
  if (!match) return null;
  return { version, major: Number(match[1]), minor: Number(match[2]) };
}

function extractDirVersion(path: string): string | null {
  const match = /\/assets\/game\/eu5\/([^/]+)\//.exec(path);
  return match ? match[1] : null;
}

function discoverBundles(): Map<string, { game: string; map: string; loc: string }> {
  const games = new Map<string, string>();
  for (const [path, url] of Object.entries(gameZipUrls)) {
    const version = extractDirVersion(path);
    if (version !== null) games.set(version, url);
  }

  const locs = new Map<string, string>();
  for (const [path, url] of Object.entries(locZipUrls)) {
    const version = extractDirVersion(path);
    if (version !== null) locs.set(version, url);
  }

  const complete = new Map<string, { game: string; map: string; loc: string }>();
  for (const [path, mapUrl] of Object.entries(mapZipUrls)) {
    const version = extractDirVersion(path);
    if (version === null || parseBundleVersion(version) === null) continue;
    const gameUrl = games.get(version);
    const locUrl = locs.get(version);
    if (gameUrl && locUrl) {
      complete.set(version, { game: gameUrl, map: mapUrl, loc: locUrl });
    }
  }

  return complete;
}

const completeBundles = discoverBundles();

function resolveBundleVersion(requested: string): string {
  if (completeBundles.has(requested)) return requested;

  const sorted = Array.from(completeBundles.keys())
    .map((v) => parseBundleVersion(v)!)
    .sort((a, b) => (b.major === a.major ? b.minor - a.minor : b.major - a.major));

  if (sorted.length === 0) {
    throw new Error("No complete EU5 optimized bundles found");
  }

  const latest = sorted[0].version;
  console.warn(`EU5 bundle for version ${requested} not found, falling back to ${latest}`);
  return latest;
}

type BundleUrls = { game: string; map: string; loc: string };
type BundleParts = {
  game: Promise<Uint8Array>;
  map: Promise<Uint8Array>;
  loc: Promise<Uint8Array>;
};

/** The bundle URLs of a version that `resolveBundleVersion` returned. */
function getBundleUrls(resolved: string): BundleUrls {
  return completeBundles.get(resolved)!;
}

async function fetchPart(url: string): Promise<Uint8Array> {
  const response = await fetchOk(url);
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

// Worker types
export type Eu5WorkerModule = typeof Eu5WorkerModuleDefinition;
export type Eu5Worker = Remote<Eu5WorkerModule>;

export type Eu5MapWorkerModule = typeof Eu5MapWorkerModuleDefinition;
export type Eu5MapWorker = Remote<Eu5MapWorkerModule>;

export type GameInstance = ReturnType<typeof saveWorker>;
export type PaletteGradients = Record<GradientPalette, string>;
export type { GradientConfig, DisplayData, SelectionSummaryData, TimelineChange, TimelineData };
export type { BoxSelectOverlayRect } from "./types/box-select";
export type { CursorHint } from "./workers/map/map-module";

export class Eu5GameAdapter {
  private constructor(
    private eu5RawWorker: Worker,
    private mapRawWorker: Worker,
    private eu5Worker: Eu5Worker,
    private eu5MapWorker: Eu5MapWorker,
  ) {}
  public static create(): Eu5GameAdapter {
    const eu5RawWorker = new Worker(new URL("./workers/game/worker.ts", import.meta.url), {
      type: "module",
    });
    trackWorker(eu5RawWorker);
    const eu5Worker = wrap<Eu5Worker>(eu5RawWorker);

    const mapRawWorker = new Worker(new URL("./workers/map/worker.ts", import.meta.url), {
      type: "module",
    });
    trackWorker(mapRawWorker);
    const eu5MapWorker = wrap<Eu5MapWorker>(mapRawWorker);

    const logLevel = getLogLevel();

    const channel = new MessageChannel();
    eu5MapWorker.initialize(transfer(channel.port1, [channel.port1]), logLevel);
    eu5Worker.initialize(transfer(channel.port2, [channel.port2]), logLevel);

    return new Eu5GameAdapter(eu5RawWorker, mapRawWorker, eu5Worker, eu5MapWorker);
  }

  /** The bundle version that the map shows. The first save chooses it. */
  private bundleVersion: string | null = null;
  private mapEngine: MapEngine | null = null;

  /** True once the map runs, so that the next save can load into it. */
  get mapStarted(): boolean {
    return this.mapEngine !== null;
  }

  /**
   * Start the map on the canvas and load the first save into it. The save
   * chooses the bundles of its patch for both workers.
   */
  async start(
    config: {
      canvas: OffscreenCanvas;
      display: {
        width: number;
        height: number;
        scaleFactor: number;
      };
      inputConfig: SharedCanvasInputConfig;
      /** The first save, which the map can start without. */
      save: Promise<Eu5SaveData>;
    },
    onProgress?: (increment: number, stage: string) => void,
  ): Promise<GameInstance> {
    // Coordinate part fetching on the main thread. The game worker calls
    // `gameBundle.selectVersion(version)` after parsing save metadata, which
    // eagerly kicks off `game.zip`, `map.zip`, and `loc-en.zip` fetches against
    // the resolved bundle family. Each worker awaits only the parts it needs:
    // the map worker awaits `map.zip`; the game worker awaits `game.zip` to
    // build the workspace and sync map buffers, then awaits
    // `loc-en.zip` to localize before exposing presentation endpoints.
    let resolveBundles: (b: BundleParts) => void;
    const bundlesPromise = new Promise<BundleParts>((resolve) => {
      resolveBundles = resolve;
    });

    const selectVersion = async (version: string) => {
      if (this.bundleVersion !== null) {
        throw new Error(`selectVersion called with ${version} after the map chose a version`);
      }
      const resolved = resolveBundleVersion(version);
      this.bundleVersion = resolved;
      const urls = getBundleUrls(resolved);
      resolveBundles({
        game: fetchPart(urls.game),
        map: fetchPart(urls.map),
        loc: fetchPart(urls.loc),
      });
      return resolved;
    };

    const gameBundleApi = {
      selectVersion,
      fetch: async () => (await bundlesPromise).game,
      fetchLocalization: async () => (await bundlesPromise).loc,
    };

    const mapBundleApi = {
      fetch: async () => (await bundlesPromise).map,
    };

    const [saveEngine, mapEngine] = await Promise.all([
      config.save.then(({ save, data }) =>
        this.eu5Worker.loadSave(
          transfer({ save, data, hold: false }, [data]),
          proxy({
            gameBundle: gameBundleApi,
            onProgress: (increment: number, stage: string) => onProgress?.(increment, stage),
          }),
        ),
      ),
      this.eu5MapWorker.createMapEngine(
        transfer(
          {
            canvas: config.canvas,
            display: config.display,
            inputConfig: config.inputConfig,
          },
          [config.canvas],
        ),
        proxy({
          mapBundle: mapBundleApi,
          onProgress: (increment: number, stage: string) => onProgress?.(increment, stage),
        }),
      ),
    ]);

    this.mapEngine = mapEngine;
    if (saveEngine === null) {
      throw new Error("The first save did not choose the bundles of the map");
    }
    return saveWorker(saveEngine, mapEngine);
  }

  /**
   * Load another save into the running map. The map keeps the previous
   * save until `show` is called on the result. Resolves null when the save
   * needs the bundles of another patch than the map shows; the save that
   * was open is closed all the same.
   */
  async load(
    { save, data }: Eu5SaveData,
    onProgress?: (increment: number, stage: string) => void,
  ): Promise<GameInstance | null> {
    const mapEngine = this.mapEngine;
    if (mapEngine === null) {
      throw new Error("The map has not started");
    }

    let urls: BundleUrls | null = null;
    const selectVersion = async (version: string) => {
      const resolved = resolveBundleVersion(version);
      if (resolved !== this.bundleVersion) return null;
      urls = getBundleUrls(resolved);
      return resolved;
    };

    // The game worker keeps the bundles of the previous save, so these run
    // only when it no longer has them.
    const gameBundleApi = {
      selectVersion,
      fetch: () => fetchPart(check(urls, "bundle version not selected").game),
      fetchLocalization: () => fetchPart(check(urls, "bundle version not selected").loc),
    };

    const saveEngine = await this.eu5Worker.loadSave(
      transfer({ save, data, hold: true }, [data]),
      proxy({
        gameBundle: gameBundleApi,
        onProgress: (increment: number, stage: string) => onProgress?.(increment, stage),
      }),
    );

    return saveEngine === null ? null : saveWorker(saveEngine, mapEngine);
  }

  /** The campaign and date of a save file, without a parse of the gamestate. */
  readSaveMeta(file: File) {
    return this.eu5Worker.readSaveMeta(file);
  }

  terminate(): void {
    this.eu5RawWorker.terminate();
    this.mapRawWorker.terminate();
  }
}

type SaveEngine = NonNullable<Awaited<ReturnType<Eu5Worker["loadSave"]>>>;
type MapEngine = Awaited<ReturnType<Eu5MapWorker["createMapEngine"]>>;

function saveWorker(saveEngine: SaveEngine, mapEngine: MapEngine) {
  let hoverDisplayCallback: ((data: DisplayData) => void) | null = null;
  let selectionCallback: ((data: SelectionSummaryData, gradient?: GradientConfig) => void) | null =
    null;
  let boxSelectRectCallback: ((rect: BoxSelectOverlayRect | null) => void) | null = null;
  let cursorHintCallback: ((hint: CursorHint) => void) | null = null;
  let viewportCallback: ((viewport: MapViewport) => void) | null = null;

  saveEngine.onHoverDisplayUpdate(
    proxy((data: DisplayData) => {
      hoverDisplayCallback?.(data);
    }),
  );

  saveEngine.onSelectionUpdate(
    proxy((data: SelectionSummaryData, gradient?: GradientConfig) => {
      selectionCallback?.(data, gradient);
    }),
  );

  mapEngine.onBoxSelectRectUpdate(
    proxy((rect: BoxSelectOverlayRect | null) => {
      boxSelectRectCallback?.(rect);
    }),
  );

  mapEngine.onCursorHintUpdate(
    proxy((hint: CursorHint) => {
      cursorHintCallback?.(hint);
    }),
  );

  mapEngine.onViewportChange(
    proxy((viewport: MapViewport) => {
      viewportCallback?.(viewport);
    }),
  );

  return {
    /** Show this save on the map, after a load that kept the previous one. */
    show: () => saveEngine.show(),
    /** Stop the use of this save. Later calls on it reject. */
    release: () => saveEngine[releaseProxy](),
    getZoom: () => mapEngine.get_zoom(),
    fitWorldRect: (rect: MapViewport["viewport"]) => mapEngine.fitWorldRect(rect),
    getPaletteGradients: async (): Promise<PaletteGradients> => {
      return await saveEngine.getPaletteGradients();
    },
    setMapMode: async (mode: MapMode): Promise<TimelineChange> => {
      return await saveEngine.setMapMode(mode);
    },
    getTimeline: async (): Promise<TimelineData> => {
      return await saveEngine.getTimeline();
    },
    setTimelineDate: async (date: Eu5DateComponents): Promise<TimelineChange> => {
      return await saveEngine.setTimelineDate(date);
    },
    beginTimelapseRecording: (options: {
      framing: TimelapseFraming;
      output: { width: number; height: number };
      colors: DatePlateColors;
      fonts: DatePlateFonts;
    }): Promise<TimelapseFrameLayout> => {
      return mapEngine.beginTimelapseRecording(options);
    },
    recordTimelapseFrame: (date: Eu5DateComponents): Promise<TimelapseFrameTiming> => {
      return mapEngine.recordTimelapseFrame(date);
    },
    finishTimelapseRecording: (): Promise<TimelapseFile> => {
      return mapEngine.finishTimelapseRecording();
    },
    endTimelapseRecording: (): Promise<void> => {
      return mapEngine.endTimelapseRecording();
    },
    generateWorldScreenshot: async (fullResolution: boolean): Promise<Blob> => {
      const overlayData = await saveEngine.getOverlayData();
      return await mapEngine.generateWorldScreenshot(fullResolution, overlayData);
    },
    setOwnerBorders: (enabled: boolean) => {
      mapEngine.execCommands([{ kind: "setOwnerBorders", enabled }, { kind: "render" }]);
    },
    getLocationArrays: () => {
      return saveEngine.getLocationArrays();
    },

    melt: () => {
      return saveEngine.melt();
    },

    startHoverTracking: () => mapEngine.startHoverTracking(),

    stopHoverTracking: () => mapEngine.stopHoverTracking(),

    onHoverDisplayUpdate: (callback: (data: DisplayData) => void) => {
      hoverDisplayCallback = callback;
    },

    onSelectionUpdate: (
      callback: (data: SelectionSummaryData, gradient?: GradientConfig) => void,
    ) => {
      selectionCallback = callback;
    },

    onBoxSelectRectUpdate: (callback: (rect: BoxSelectOverlayRect | null) => void) => {
      boxSelectRectCallback = callback;
    },

    onCursorHintUpdate: (callback: (hint: CursorHint) => void) => {
      cursorHintCallback = callback;
    },
    onViewportChange: (callback: (viewport: MapViewport) => void) => {
      viewportCallback = callback;
    },

    selectCountry: (countryIdx: number) => {
      return saveEngine.selectCountry(countryIdx);
    },
    addCountry: (countryIdx: number) => {
      return saveEngine.addCountry(countryIdx);
    },
    removeCountry: (countryIdx: number) => {
      return saveEngine.removeCountry(countryIdx);
    },
    selectMarket: (marketId: number) => {
      return saveEngine.selectMarket(marketId);
    },
    addMarket: (marketId: number) => {
      return saveEngine.addMarket(marketId);
    },
    removeMarket: (marketId: number) => {
      return saveEngine.removeMarket(marketId);
    },
    setFocusedLocation: (locationIdx: number) => {
      return saveEngine.setFocusedLocation(locationIdx);
    },
    clearFocus: () => {
      return saveEngine.clearFocus();
    },
    clearFocusOrSelection: () => {
      return saveEngine.clearFocusOrSelection();
    },

    selectPlayers: () => {
      return saveEngine.selectPlayers();
    },

    clearSelection: () => {
      return saveEngine.clearSelection();
    },

    highlightMapHoverTarget: (target: Eu5MapHoverTarget) => {
      return saveEngine.highlightMapHoverTarget(target);
    },

    clearMapHoverHighlight: () => {
      return saveEngine.clearMapHoverHighlight();
    },

    getSaveMetadata: async () => {
      return await saveEngine.getSaveMetadata();
    },

    getStateEfficacy: async () => {
      return await saveEngine.getStateEfficacy();
    },

    getCountryProfile: async (countryIdx: number): Promise<CountryProfile | null> => {
      return await saveEngine.getCountryProfile(countryIdx);
    },
    getCountryPopulationProfile: async (
      countryIdx: number,
    ): Promise<CountryPopulationProfile | null> => {
      return await saveEngine.getCountryPopulationProfile(countryIdx);
    },
    getMarketProfile: async (marketId: number): Promise<MarketProfile | null> => {
      return await saveEngine.getMarketProfile(marketId);
    },
    getMarketGoodsProfile: async (marketId: number): Promise<ScopedGoodSummary[]> => {
      return await saveEngine.getMarketGoodsProfile(marketId);
    },
    getMarketLocationsProfile: async (
      marketId: number,
    ): Promise<MarketProductionLocationSummary[]> => {
      return await saveEngine.getMarketLocationsProfile(marketId);
    },
    getLocationProfile: async (locationIdx: number): Promise<LocationProfile | null> => {
      return await saveEngine.getLocationProfile(locationIdx);
    },

    getDevelopmentInsight: async (): Promise<DevelopmentInsightData> => {
      return await saveEngine.getDevelopmentInsight();
    },
    getWealthInsight: async (): Promise<WealthInsightData> => {
      return await saveEngine.getWealthInsight();
    },
    getWealthScope: async (): Promise<WealthScope> => {
      return await saveEngine.getWealthScope();
    },
    getUnrealizedTaxBaseInsight: async (): Promise<UnrealizedTaxBaseInsightData> => {
      return await saveEngine.getUnrealizedTaxBaseInsight();
    },
    getUnrealizedTaxBaseScope: async (): Promise<UnrealizedTaxBaseScope> => {
      return await saveEngine.getUnrealizedTaxBaseScope();
    },
    getMarketInsight: async (): Promise<MarketInsightData> => {
      return await saveEngine.getMarketInsight();
    },
    getPopulationInsight: async (): Promise<PopulationInsightData> => {
      return await saveEngine.getPopulationInsight();
    },
    getPopulationGrowthInsight: async (): Promise<PopulationGrowthInsightData> => {
      return await saveEngine.getPopulationGrowthInsight();
    },
    getBuildingLevelsInsight: async (): Promise<BuildingLevelsInsightData> => {
      return await saveEngine.getBuildingLevelsInsight();
    },
    getReligionInsight: async (): Promise<ReligionInsightData> => {
      return await saveEngine.getReligionInsight();
    },
    getRgoInsight: async (): Promise<RgoInsightData> => {
      return await saveEngine.getRgoInsight();
    },
    getControlInsight: async (): Promise<ControlInsightData> => {
      return await saveEngine.getControlInsight();
    },
    getPoliticalWorldScoreboard: async (): Promise<PoliticalWorldScoreboard> => {
      return await saveEngine.getPoliticalWorldScoreboard();
    },
    getPoliticalDefaultCountryAnchor: async (): Promise<number | null> => {
      return await saveEngine.getPoliticalDefaultCountryAnchor();
    },

    searchEntities: async (query: string) => {
      return await saveEngine.searchEntities(query);
    },

    panToLocation: async (
      locationIdx: number,
      insets: { left: number; right: number; top: number; bottom: number },
    ) => {
      const colorId = await saveEngine.getLocationColorId(locationIdx);
      if (colorId != null) {
        await mapEngine.pan_to_color_id(colorId, insets);
      }
    },
  };
}
