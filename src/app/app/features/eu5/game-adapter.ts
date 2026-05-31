import { wrap, transfer, proxy } from "comlink";
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
  BuildingLevelsInsightData,
  ReligionInsightData,
  RgoInsightData,
  ControlInsightData,
  PoliticalWorldScoreboard,
} from "@/wasm/wasm_eu5";
import type { Eu5SaveInput } from "./store/types";
import type { Eu5MapHoverTarget } from "./useEu5MapHoverTarget";
import { fetchOk } from "@/lib/fetch";
import { getLogLevel } from "@/lib/isDeveloper";
import type * as Eu5WorkerModuleDefinition from "./workers/game/game-module";
import type * as Eu5MapWorkerModuleDefinition from "./workers/map/map-module";
import type { SharedCanvasInputConfig } from "@/lib/canvas_courier";
import type { BoxSelectOverlayRect } from "./types/box-select";
import type { CursorHint } from "./workers/map/map-module";

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

function getBundleUrls(version: string): { game: string; map: string; loc: string } {
  const resolved = resolveBundleVersion(version);
  return completeBundles.get(resolved)!;
}

// Worker types
export type Eu5WorkerModule = typeof Eu5WorkerModuleDefinition;
export type Eu5Worker = Remote<Eu5WorkerModule>;

export type Eu5MapWorkerModule = typeof Eu5MapWorkerModuleDefinition;
export type Eu5MapWorker = Remote<Eu5MapWorkerModule>;

export type GameInstance = ReturnType<typeof saveWorker>;
export type PaletteGradients = Record<GradientPalette, string>;
export type { GradientConfig, DisplayData, SelectionSummaryData };
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
    const eu5Worker = wrap<Eu5Worker>(eu5RawWorker);

    const mapRawWorker = new Worker(new URL("./workers/map/worker.ts", import.meta.url), {
      type: "module",
    });
    const eu5MapWorker = wrap<Eu5MapWorker>(mapRawWorker);

    const logLevel = getLogLevel();

    const channel = new MessageChannel();
    eu5MapWorker.initialize(transfer(channel.port1, [channel.port1]), logLevel);
    eu5Worker.initialize(transfer(channel.port2, [channel.port2]), logLevel);

    return new Eu5GameAdapter(eu5RawWorker, mapRawWorker, eu5Worker, eu5MapWorker);
  }

  async newSave(
    config: {
      canvas: OffscreenCanvas;
      display: {
        width: number;
        height: number;
        scaleFactor: number;
      };
      inputConfig: SharedCanvasInputConfig;
      save: Eu5SaveInput;
    },
    onProgress?: (increment: number) => void,
  ) {
    // Coordinate part fetching on the main thread. The game worker calls
    // `gameBundle.selectVersion(version)` after parsing save metadata, which
    // eagerly kicks off `game.zip`, `map.zip`, and `loc-en.zip` fetches against
    // the resolved bundle family. Each worker awaits only the parts it needs:
    // the map worker awaits `map.zip`; the game worker awaits `game.zip` to
    // build the workspace and sync map buffers, then awaits
    // `loc-en.zip` to localize before exposing presentation endpoints.
    let resolvedVersion: string | null = null;
    let resolveBundles: (b: {
      game: Promise<Uint8Array>;
      map: Promise<Uint8Array>;
      loc: Promise<Uint8Array>;
    }) => void;

    const bundlesPromise = new Promise<{
      game: Promise<Uint8Array>;
      map: Promise<Uint8Array>;
      loc: Promise<Uint8Array>;
    }>((resolve) => {
      resolveBundles = resolve;
    });

    const fetchPart = async (url: string): Promise<Uint8Array> => {
      const response = await fetchOk(url);
      const arrayBuffer = await response.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    };

    const selectVersion = (version: string) => {
      if (resolvedVersion !== null) {
        if (resolvedVersion !== version) {
          throw new Error(
            `selectVersion called with ${version} after already resolving ${resolvedVersion}`,
          );
        }
        return;
      }
      resolvedVersion = version;
      const urls = getBundleUrls(version);
      resolveBundles({
        game: fetchPart(urls.game),
        map: fetchPart(urls.map),
        loc: fetchPart(urls.loc),
      });
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
      this.eu5Worker.createGame(
        { save: config.save },
        proxy({
          gameBundle: gameBundleApi,
          onProgress: (increment: number) => onProgress?.(increment),
        }),
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
          onProgress: (increment: number) => onProgress?.(increment),
        }),
      ),
    ]);

    return saveWorker(saveEngine, mapEngine);
  }

  terminate(): void {
    this.eu5RawWorker.terminate();
    this.mapRawWorker.terminate();
  }
}

export function saveWorker(
  saveEngine: Awaited<ReturnType<Eu5Worker["createGame"]>>,
  mapEngine: Awaited<ReturnType<Eu5MapWorker["createMapEngine"]>>,
) {
  let hoverDisplayCallback: ((data: DisplayData) => void) | null = null;
  let selectionCallback: ((data: SelectionSummaryData, gradient?: GradientConfig) => void) | null =
    null;
  let boxSelectRectCallback: ((rect: BoxSelectOverlayRect | null) => void) | null = null;
  let cursorHintCallback: ((hint: CursorHint) => void) | null = null;

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

  return {
    getZoom: () => mapEngine.get_zoom(),
    getPaletteGradients: async (): Promise<PaletteGradients> => {
      return await saveEngine.getPaletteGradients();
    },
    setMapMode: async (mode: MapMode): Promise<void> => {
      await saveEngine.setMapMode(mode);
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
