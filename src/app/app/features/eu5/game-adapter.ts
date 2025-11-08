import { wrap, transfer, proxy } from "comlink";
import type { Remote } from "comlink";
import type {
  LocationLookupResult,
  MapCommand,
} from "./workers/map/map-module";
import type { HoverDisplayData, MapMode } from "@/wasm/wasm_eu5";
import type { Eu5SaveInput } from "./store/useLoadEu5";
import bundleUrl from "../../../../../assets/game/eu5/eu5-1.0.zip?url";
import { fetchOk } from "@/lib/fetch";
import type * as Eu5WorkerModuleDefinition from "./workers/game/game-module";
import type * as Eu5MapWorkerModuleDefinition from "./workers/map/map-module";

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
    const channel = new MessageChannel();
    eu5MapWorker.initialize(transfer(channel.port1, [channel.port1]));
    eu5Worker.initialize(transfer(channel.port2, [channel.port2]));

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
    let gameBundleRes: (value: Uint8Array) => void;
    let gameBundleRej: (reason?: any) => void;
    const bundleTask = new Promise<Uint8Array>((res, rej) => {
      gameBundleRes = res;
      gameBundleRej = rej;
    });

    const [saveEngine, mapEngine] = await Promise.all([
      this.eu5Worker.createGame(
        { save: config.save },
        proxy({
          bundleFetch: async () => {
            const bundle = fetchOk(bundleUrl)
              .then((x) => x.arrayBuffer())
              .then((x) => new Uint8Array(x));

            bundle.then(gameBundleRes, gameBundleRej);
            return await bundle;
          },
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
          bundleFetch: async () => {
            const bundle = await bundleTask;
            return bundle;
          },
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
  let currentHighlightedLocation: LocationLookupResult | null = null;
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
    zoomAtPoint: (cursorX: number, cursorY: number, zoomDelta: number) =>
      mapEngine.zoomAtPoint(cursorX, cursorY, zoomDelta),
    canvasToWorld: (canvasX: number, canvasY: number) =>
      mapEngine.canvasToWorld(canvasX, canvasY),
    setWorldPointUnderCursor: (
      worldX: number,
      worldY: number,
      canvasX: number,
      canvasY: number,
    ) => mapEngine.setWorldPointUnderCursor(worldX, worldY, canvasX, canvasY),
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
    getLocationUnderCursor: async (canvasX: number, canvasY: number) => {
      const result = await mapEngine.getLocationUnderCursor(canvasX, canvasY);
      if (result.kind === "throttled") {
        return result;
      }

      if (currentHighlightedLocation?.locationId !== result.locationId) {
        const commands: MapCommand[] = [];
        if (currentHighlightedLocation !== null) {
          commands.push({
            kind: "unhighlight",
            locationIdx: currentHighlightedLocation.locationIdx,
          });
        }

        // Only highlight if the location can be highlighted (not water/impassable)
        if (await saveEngine.canHighlightLocation(result.locationId)) {
          commands.push({ kind: "highlight", locationIdx: result.locationIdx });
          currentHighlightedLocation = result;
        } else {
          currentHighlightedLocation = null;
        }

        commands.push({ kind: "render" });
        await mapEngine.execCommands(commands);
      }
      return result;
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
  };
}
