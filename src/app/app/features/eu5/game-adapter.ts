import { wrap, transfer, proxy } from "comlink";
import type { Remote } from "comlink";
import type {
  HoverDisplayData,
  MapMode,
  SelectionSummaryData,
  EntityHeader,
  OverviewSection,
  EconomySection,
  LocationsSection,
  DiplomacySection,
  LocationProfile,
  EntityBreakdownData,
  LocationDistribution,
  DevelopmentInsightData,
  PossibleTaxInsightData,
  PossibleTaxScope,
  ScopeSummary,
} from "@/wasm/wasm_eu5";
import type { Eu5SaveInput } from "./store/types";
import { fetchOk } from "@/lib/fetch";
import { getLogLevel } from "@/lib/isDeveloper";
import type * as Eu5WorkerModuleDefinition from "./workers/game/game-module";
import type * as Eu5MapWorkerModuleDefinition from "./workers/map/map-module";
import type { SharedCanvasInputConfig } from "@/lib/canvas_courier";
import type { BoxSelectOverlayRect } from "./types/box-select";
import type { CursorHint } from "./workers/map/map-module";

const bundleUrls = import.meta.glob<true, string, string>(
  "../../../../../assets/game/eu5/eu5-*.zip",
  { query: "?url", eager: true, import: "default" },
);

function getBundleUrl(version: string): string {
  const path = `../../../../../assets/game/eu5/eu5-${version}.zip`;
  const url = bundleUrls[path];
  if (url) {
    return url;
  }

  // Fallback to last bundle in sorted order
  const bundlePaths = Object.keys(bundleUrls).sort();
  if (bundlePaths.length === 0) {
    throw new Error("No game bundles found");
  }

  const lastBundle = bundlePaths[bundlePaths.length - 1];
  console.warn(`Bundle for version ${version} not found, falling back to ${lastBundle}`);
  return bundleUrls[lastBundle];
}

// Worker types
export type Eu5WorkerModule = typeof Eu5WorkerModuleDefinition;
export type Eu5Worker = Remote<Eu5WorkerModule>;

export type Eu5MapWorkerModule = typeof Eu5MapWorkerModuleDefinition;
export type Eu5MapWorker = Remote<Eu5MapWorkerModule>;

export type GameInstance = ReturnType<typeof saveWorker>;
export type { HoverDisplayData, SelectionSummaryData };
export type { BoxSelectOverlayRect } from "./types/box-select";
export type { CursorHint } from "./workers/map/map-module";

export interface MapModeRange {
  mode: MapMode;
  minValue: number;
  maxValue: number;
}

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
    // Fetch the game bundle on the main thread, as our other options are:
    // - Fetch in the game worker, then transfer to map worker (bad as the
    //   parsing gamestate blocks the event loop and prevents the message from
    //   being sent)
    // - Fetch in both workers (bad: as inter-web worker fetches don't *appear*
    //   to be consolidated, though under some circumstances they might).
    // So since we can do the de-duplication ourselves, might as well.
    //
    // Create bundle coordination: the game worker will call setVersion after
    // parsing metadata, and both workers will call fetch (which waits for the
    // version to be set, then fetches the appropriate bundle once).
    let bundleVersionResolver: ((version: string) => void) | null = null;
    const bundleVersionPromise = new Promise<string>((resolve) => {
      bundleVersionResolver = resolve;
    });

    let bundleFetchPromise: Promise<Uint8Array> | null = null;

    const bundleApi = {
      setVersion: (version: string) => {
        if (bundleVersionResolver) {
          bundleVersionResolver(version);
        }
      },
      fetch: async () => {
        // Only fetch once, even if called by multiple workers
        if (!bundleFetchPromise) {
          bundleFetchPromise = (async () => {
            const version = await bundleVersionPromise;
            const url = getBundleUrl(version);
            const response = await fetchOk(url);
            const arrayBuffer = await response.arrayBuffer();
            return new Uint8Array(arrayBuffer);
          })();
        }
        return await bundleFetchPromise;
      },
    };

    const [saveEngine, mapEngine] = await Promise.all([
      this.eu5Worker.createGame(
        { save: config.save },
        proxy({
          bundle: bundleApi,
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
          bundleFetch: bundleApi.fetch,
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
  let hoverDisplayCallback: ((data: HoverDisplayData) => void) | null = null;
  let selectionCallback: ((data: SelectionSummaryData) => void) | null = null;
  let boxSelectRectCallback: ((rect: BoxSelectOverlayRect | null) => void) | null = null;
  let cursorHintCallback: ((hint: CursorHint) => void) | null = null;

  // Set up hover display callback from game worker
  saveEngine.onHoverDisplayUpdate(
    proxy((data: HoverDisplayData) => {
      hoverDisplayCallback?.(data);
    }),
  );

  // Set up selection callback from game worker
  saveEngine.onSelectionUpdate(
    proxy((data: SelectionSummaryData) => {
      selectionCallback?.(data);
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
    setMapMode: async (mode: MapMode) => {
      await saveEngine.setMapMode(mode);
      return mode;
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

    onHoverDisplayUpdate: (callback: (data: HoverDisplayData) => void) => {
      hoverDisplayCallback = callback;
    },

    onSelectionUpdate: (callback: (data: SelectionSummaryData) => void) => {
      selectionCallback = callback;
    },

    onBoxSelectRectUpdate: (callback: (rect: BoxSelectOverlayRect | null) => void) => {
      boxSelectRectCallback = callback;
    },

    onCursorHintUpdate: (callback: (hint: CursorHint) => void) => {
      cursorHintCallback = callback;
    },

    selectEntity: (locationIdx: number) => {
      return saveEngine.selectEntity(locationIdx);
    },
    selectCountry: (locationIdx: number) => {
      return saveEngine.selectCountry(locationIdx);
    },
    addCountry: (locationIdx: number) => {
      return saveEngine.addCountry(locationIdx);
    },
    removeCountry: (locationIdx: number) => {
      return saveEngine.removeCountry(locationIdx);
    },
    selectMarket: (locationIdx: number) => {
      return saveEngine.selectMarket(locationIdx);
    },
    addMarket: (locationIdx: number) => {
      return saveEngine.addMarket(locationIdx);
    },
    removeMarket: (locationIdx: number) => {
      return saveEngine.removeMarket(locationIdx);
    },
    addEntity: (locationIdx: number) => {
      return saveEngine.addEntity(locationIdx);
    },
    removeEntity: (locationIdx: number) => {
      return saveEngine.removeEntity(locationIdx);
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

    getMapModeRange: async (mode: MapMode): Promise<MapModeRange> => {
      return await saveEngine.getMapModeRange(mode);
    },

    getSaveMetadata: async () => {
      return await saveEngine.getSaveMetadata();
    },

    getStateEfficacy: async () => {
      return await saveEngine.getStateEfficacy();
    },

    getEntityHeader: async (): Promise<EntityHeader | null> => {
      return await saveEngine.getEntityHeader();
    },
    getOverviewSection: async (): Promise<OverviewSection | null> => {
      return await saveEngine.getOverviewSection();
    },
    getEconomySection: async (): Promise<EconomySection | null> => {
      return await saveEngine.getEconomySection();
    },
    getLocationsSection: async (): Promise<LocationsSection | null> => {
      return await saveEngine.getLocationsSection();
    },
    getDiplomacySection: async (): Promise<DiplomacySection | null> => {
      return await saveEngine.getDiplomacySection();
    },
    getLocationProfile: async (locationIdx: number): Promise<LocationProfile | null> => {
      return await saveEngine.getLocationProfile(locationIdx);
    },

    getEntityBreakdown: async (): Promise<EntityBreakdownData> => {
      return await saveEngine.getEntityBreakdown();
    },
    getLocationDistribution: async (): Promise<LocationDistribution> => {
      return await saveEngine.getLocationDistribution();
    },
    getDevelopmentInsight: async (): Promise<DevelopmentInsightData> => {
      return await saveEngine.getDevelopmentInsight();
    },
    getPossibleTaxInsight: async (): Promise<PossibleTaxInsightData> => {
      return await saveEngine.getPossibleTaxInsight();
    },
    getPossibleTaxScope: async (): Promise<PossibleTaxScope> => {
      return await saveEngine.getPossibleTaxScope();
    },
    getScopeSummary: async (): Promise<ScopeSummary> => {
      return await saveEngine.getScopeSummary();
    },
    getEntityHeaderFor: async (anchorLocationIdx: number): Promise<EntityHeader | null> => {
      return await saveEngine.getEntityHeaderFor(anchorLocationIdx);
    },
    getOverviewSectionFor: async (anchorLocationIdx: number): Promise<OverviewSection | null> => {
      return await saveEngine.getOverviewSectionFor(anchorLocationIdx);
    },
    getEconomySectionFor: async (anchorLocationIdx: number): Promise<EconomySection | null> => {
      return await saveEngine.getEconomySectionFor(anchorLocationIdx);
    },
    getLocationsSectionFor: async (anchorLocationIdx: number): Promise<LocationsSection | null> => {
      return await saveEngine.getLocationsSectionFor(anchorLocationIdx);
    },
    getDiplomacySectionFor: async (anchorLocationIdx: number): Promise<DiplomacySection | null> => {
      return await saveEngine.getDiplomacySectionFor(anchorLocationIdx);
    },

    searchCountries: async (query: string) => {
      return await saveEngine.searchCountries(query);
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
