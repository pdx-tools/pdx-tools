import type { MapInteraction } from "./history/mapInteraction";
import type { MapObservation } from "./history/analysisTypes";
import type { Eu5Carry } from "./campaignCarry";
import { wrap, transfer, proxy, releaseProxy } from "comlink";
import type { Remote } from "comlink";
import type {
  ActiveProfileIdentity,
  GradientConfig,
  GradientPalette,
  DisplayData,
  MapMode,
  SelectionSummaryData,
  Eu5DateComponents,
  TimelineChange,
  TimelineData,
} from "@/wasm/wasm_eu5";
import type { Eu5SaveData } from "./store/types";
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

import type { BundleUrls } from "./bundleUrls";
import { resolveBundleVersion, getBundleUrls } from "./bundleUrls";
type BundleParts = {
  game: Promise<Uint8Array>;
  map: Promise<Uint8Array>;
  loc: Promise<Uint8Array>;
};

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

  /** The map can reuse only the bundles selected for its first save. */
  private bundleVersion: string | null = null;
  private mapEngine: MapEngine | null = null;

  get mapStarted(): boolean {
    return this.mapEngine !== null;
  }

  /** Initialize the map and game workers with the first save. */
  async start(
    config: {
      canvas: OffscreenCanvas;
      display: {
        width: number;
        height: number;
        scaleFactor: number;
      };
      inputConfig: SharedCanvasInputConfig;
      /** File reading can run while the map initializes. */
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
          { save, data, hold: false },
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
   * Keep the current map visible until the next save is ready.
   * Return null when a different patch requires a new map.
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

    // Reuse loaded game bundles across compatible saves.
    const gameBundleApi = {
      selectVersion,
      fetch: () => fetchPart(check(urls, "bundle version not selected").game),
      fetchLocalization: () => fetchPart(check(urls, "bundle version not selected").loc),
    };

    const saveEngine = await this.eu5Worker.loadSave(
      { save, data, hold: true },
      proxy({
        gameBundle: gameBundleApi,
        onProgress: (increment: number, stage: string) => onProgress?.(increment, stage),
      }),
    );

    return saveEngine === null ? null : saveWorker(saveEngine, mapEngine);
  }

  terminate(): void {
    this.eu5RawWorker.terminate();
    this.mapRawWorker.terminate();
  }
}

type SaveEngine = NonNullable<Awaited<ReturnType<Eu5Worker["loadSave"]>>>;
type MapEngine = Awaited<ReturnType<Eu5MapWorker["createMapEngine"]>>;

/** Reads of the open save. */
export type SaveQueries = Pick<
  SaveEngine,
  | "getStateEfficacy"
  | "getCountryProfile"
  | "getCountryPopulationProfile"
  | "getMarketProfile"
  | "getMarketGoodsProfile"
  | "getMarketLocationsProfile"
  | "getLocationProfile"
  | "getDevelopmentInsight"
  | "getWealthInsight"
  | "getWealthScope"
  | "getUnrealizedTaxBaseInsight"
  | "getUnrealizedTaxBaseScope"
  | "getMarketInsight"
  | "getPopulationInsight"
  | "getPopulationGrowthInsight"
  | "getBuildingLevelsInsight"
  | "getReligionInsight"
  | "getRgoInsight"
  | "getControlInsight"
  | "getPoliticalWorldScoreboard"
  | "getPoliticalDefaultCountryAnchor"
  | "searchEntities"
  | "getCountryIdentity"
  | "findCountry"
  | "getLocationArrays"
  | "melt"
>;

/** Changes to the selection, focus and highlight of the open save. */
export type SaveCommands = Pick<
  SaveEngine,
  | "selectCountry"
  | "addCountry"
  | "removeCountry"
  | "selectMarket"
  | "addMarket"
  | "removeMarket"
  | "setFocusedLocation"
  | "clearFocus"
  | "clearFocusOrSelection"
  | "selectPlayers"
  | "clearSelection"
  | "highlightMapHoverTarget"
  | "clearMapHoverHighlight"
>;

/** Set to `never` each method that returns a result. */
type WithoutResults<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => Promise<void> ? T[K] : never;
};

/** After release, send each call to `released` instead of the worker. */
export function guardRelease<T extends object>(
  remote: T,
  isReleased: () => boolean,
  released: () => Promise<void>,
): T {
  return new Proxy(remote, {
    // Keep "then" so that the proxy does not look like a promise.
    get: (target, key) => (isReleased() && key !== "then" ? released : Reflect.get(target, key)),
  });
}

function saveWorker(saveEngine: SaveEngine, mapEngine: MapEngine) {
  // The UI can still hold a save after a save change releases it.
  let isReleased = false;
  const save = guardRelease(
    saveEngine,
    () => isReleased,
    () => Promise.reject(new DOMException("The save was released", "AbortError")),
  );
  const queries: SaveQueries = save;
  // A command on a released save does nothing, so a command must not return a result.
  const commands: WithoutResults<SaveCommands> = guardRelease(
    saveEngine,
    () => isReleased,
    () => Promise.resolve(),
  );

  let hoverDisplayCallback: ((data: DisplayData) => void) | null = null;
  let selectionCallback:
    | ((data: SelectionSummaryData, gradient?: GradientConfig, fromTimeline?: boolean) => void)
    | null = null;
  let boxSelectRectCallback: ((rect: BoxSelectOverlayRect | null) => void) | null = null;
  let cursorHintCallback: ((hint: CursorHint) => void) | null = null;
  let viewportCallback: ((viewport: MapViewport) => void) | null = null;
  // Retain initial map state until the UI subscribes.
  let lastCursorHint: CursorHint | null = null;
  let lastViewport: MapViewport | null = null;

  saveEngine.onHoverDisplayUpdate(
    proxy((data: DisplayData) => {
      hoverDisplayCallback?.(data);
    }),
  );

  saveEngine.onSelectionUpdate(
    proxy((data: SelectionSummaryData, gradient?: GradientConfig, fromTimeline?: boolean) => {
      selectionCallback?.(data, gradient, fromTimeline);
    }),
  );

  mapEngine.onBoxSelectRectUpdate(
    proxy((rect: BoxSelectOverlayRect | null) => {
      boxSelectRectCallback?.(rect);
    }),
  );

  mapEngine.onCursorHintUpdate(
    proxy((hint: CursorHint) => {
      lastCursorHint = hint;
      cursorHintCallback?.(hint);
    }),
  );

  mapEngine.onViewportChange(
    proxy((viewport: MapViewport) => {
      lastViewport = viewport;
      viewportCallback?.(viewport);
    }),
  );

  return {
    queries,
    commands,

    show: () => save.show(),
    replayMapInteraction: (interaction: MapInteraction) => save.replayMapInteraction(interaction),
    requestMapInspection: (interaction: MapInteraction) => save.requestMapInspection(interaction),
    getMapLayoutKey: () => save.getMapLayoutKey(),
    connectMapFrames: (id: string, port: MessagePort | null) =>
      save.connectMapFrames(id, port ? transfer(port, [port]) : null),
    stopMapProjection: () => save.stopMapProjection(),
    showMapProjection: (frame: MapObservation, mode: MapMode) =>
      save.showMapObservation(frame.hash, mode),
    clearMapProjection: () => save.clearMapProjection(),
    onMapInspect: (callback: ((interaction: MapInteraction) => void) | null) =>
      save.onMapInspect(callback ? proxy(callback) : null),

    release: () => {
      isReleased = true;
      saveEngine[releaseProxy]();
    },
    getZoom: () => mapEngine.get_zoom(),
    fitWorldRect: (rect: MapViewport["viewport"]) => mapEngine.fitWorldRect(rect),
    getSaveMetadata: () => save.getSaveMetadata(),
    getPaletteGradients: (): Promise<PaletteGradients> => save.getPaletteGradients(),
    setMapMode: (mode: MapMode): Promise<TimelineChange> => save.setMapMode(mode),
    getTimeline: (): Promise<TimelineData> => save.getTimeline(),
    setTimelineDate: (date: Eu5DateComponents): Promise<TimelineChange> =>
      save.setTimelineDate(date),
    getCampaignIdentities: (profiles: ActiveProfileIdentity[]) =>
      save.getCampaignIdentities(profiles),
    restoreCampaignView: (carry: Eu5Carry) => save.restoreCampaignView(carry),
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
      const overlayData = await save.getOverlayData();
      return await mapEngine.generateWorldScreenshot(fullResolution, overlayData);
    },
    setOwnerBorders: (enabled: boolean) => {
      mapEngine.execCommands([{ kind: "setOwnerBorders", enabled }, { kind: "render" }]);
    },

    startHoverTracking: () => mapEngine.startHoverTracking(),

    stopHoverTracking: () => mapEngine.stopHoverTracking(),

    onHoverDisplayUpdate: (callback: (data: DisplayData) => void) => {
      hoverDisplayCallback = callback;
    },

    onSelectionUpdate: (
      callback: (
        data: SelectionSummaryData,
        gradient?: GradientConfig,
        fromTimeline?: boolean,
      ) => void,
    ) => {
      selectionCallback = callback;
    },

    onBoxSelectRectUpdate: (callback: (rect: BoxSelectOverlayRect | null) => void) => {
      boxSelectRectCallback = callback;
    },

    onCursorHintUpdate: (callback: (hint: CursorHint) => void) => {
      cursorHintCallback = callback;
      if (lastCursorHint !== null) callback(lastCursorHint);
    },
    onViewportChange: (callback: (viewport: MapViewport) => void) => {
      viewportCallback = callback;
      if (lastViewport !== null) callback(lastViewport);
    },

    panToLocation: async (
      locationIdx: number,
      insets: { left: number; right: number; top: number; bottom: number },
    ) => {
      // Like a command, a pan on a released save does nothing.
      if (isReleased) return;
      const colorId = await save.getLocationColorId(locationIdx);
      if (colorId != null) {
        await mapEngine.pan_to_color_id(colorId, insets);
      }
    },
  };
}
