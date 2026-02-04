import { wrap, transfer, proxy } from "comlink";
import type { Remote } from "comlink";
import type { HoverDisplayData, MapMode } from "@/wasm/wasm_eu5";
import type { Eu5SaveInput } from "./store/useLoadEu5";
import { fetchOk } from "@/lib/fetch";
import { getLogLevel } from "@/lib/isDeveloper";
import type * as Eu5WorkerModuleDefinition from "./workers/game/game-module";
import type * as Eu5MapWorkerModuleDefinition from "./workers/map/map-module";

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
  console.warn(
    `Bundle for version ${version} not found, falling back to ${lastBundle}`,
  );
  return bundleUrls[lastBundle];
}

// Worker types
export type Eu5WorkerModule = typeof Eu5WorkerModuleDefinition;
export type Eu5Worker = Remote<Eu5WorkerModule>;

export type Eu5MapWorkerModule = typeof Eu5MapWorkerModuleDefinition;
export type Eu5MapWorker = Remote<Eu5MapWorkerModule>;

export type GameInstance = ReturnType<typeof saveWorker>;
export type { HoverDisplayData };

export interface MapModeRange {
  mode: MapMode;
  minValue: number;
  maxValue: number;
}

export interface CanvasConfig {
  canvas: HTMLCanvasElement;
  container: HTMLElement;
}

export class Eu5GameAdapter {
  private constructor(
    private eu5RawWorker: Worker,
    private mapRawWorker: Worker,
    private eu5Worker: Eu5Worker,
    private eu5MapWorker: Eu5MapWorker,
  ) {}
  public static create(): Eu5GameAdapter {
    const eu5RawWorker = new Worker(
      new URL("./workers/game/worker.ts", import.meta.url),
      {
        type: "module",
      },
    );
    const eu5Worker = wrap<Eu5Worker>(eu5RawWorker);

    const mapRawWorker = new Worker(
      new URL("./workers/map/worker.ts", import.meta.url),
      { type: "module" },
    );
    const eu5MapWorker = wrap<Eu5MapWorker>(mapRawWorker);

    const logLevel = getLogLevel();

    const channel = new MessageChannel();
    eu5MapWorker.initialize(transfer(channel.port1, [channel.port1]), logLevel);
    eu5Worker.initialize(transfer(channel.port2, [channel.port2]), logLevel);

    return new Eu5GameAdapter(
      eu5RawWorker,
      mapRawWorker,
      eu5Worker,
      eu5MapWorker,
    );
  }

  async newSave(
    config: {
      canvas: OffscreenCanvas;
      display: {
        width: number;
        height: number;
        scaleFactor: number;
      };
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

  // Set up hover display callback from game worker
  saveEngine.onHoverDisplayUpdate(
    proxy((data: HoverDisplayData) => {
      hoverDisplayCallback?.(data);
    }),
  );

  return {
    resize: (width: number, height: number) => mapEngine.resize(width, height),
    getZoom: () => mapEngine.get_zoom(),
    onCursorMove: (x: number, y: number) => mapEngine.onCursorMove(x, y),
    onMouseButton: (button: number, pressed: boolean) =>
      mapEngine.onMouseButton(button, pressed),
    onScroll: (scrollLines: number) => mapEngine.onScroll(scrollLines),
    onKeyDown: (code: string) => mapEngine.onKeyDown(code),
    onKeyUp: (code: string) => mapEngine.onKeyUp(code),
    isDragging: () => mapEngine.isDragging(),
    setMapMode: async (mode: MapMode) => {
      await saveEngine.setMapMode(mode);
      return mode;
    },
    generateWorldScreenshot: async (fullResolution: boolean): Promise<Blob> => {
      const overlayData = await saveEngine.getOverlayData();
      return await mapEngine.generateWorldScreenshot(
        fullResolution,
        overlayData,
      );
    },
    setOwnerBorders: (enabled: boolean) => {
      mapEngine.execCommands([
        { kind: "setOwnerBorders", enabled },
        { kind: "render" },
      ]);
    },
    getLocationArrays: () => {
      return saveEngine.getLocationArrays();
    },

    melt: () => {
      return saveEngine.melt();
    },

    updateCursorWorldPosition: (canvasX: number, canvasY: number) =>
      mapEngine.updateCursorWorldPosition(canvasX, canvasY),

    startHoverTracking: () => mapEngine.startHoverTracking(),

    stopHoverTracking: () => mapEngine.stopHoverTracking(),

    onHoverDisplayUpdate: (callback: (data: HoverDisplayData) => void) => {
      hoverDisplayCallback = callback;
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
  };
}
