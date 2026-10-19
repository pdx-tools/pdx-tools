import { proxy, transfer, wrap } from "comlink";
import type { Remote } from "comlink";
import { CanvasCourierHost } from "@/lib/canvas_courier";
import type { CanvasCourierSurface, CanvasCourierTransport } from "@/lib/canvas_courier";
import { captureException } from "@/lib/captureException";
import { isWebGPUSupported } from "@/lib/compatibility";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { getLogLevel } from "@/lib/isDeveloper";
import { trackWorker } from "@/lib/sentryWorker";
import { registerAnalysisTerminator } from "@/features/engine/analysisLifecycle";
import { getHoi4Worker } from "../worker";
import type {
  CountryDisplay,
  Hoi4Metadata,
  Hoi4Overview,
  MapMatch,
  MapMode,
  ProvinceDetails,
} from "../worker/types";
import { resolveHoi4Bundle } from "./bundles";
import type * as MapModule from "./map-module";

const GPU_UNAVAILABLE = "This browser or device does not support WebGPU.";
const CANVAS_CLASS = "h-full w-full touch-none outline-none";

export type Hoi4MapStatus =
  | { kind: "waiting" }
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "unavailable"; reason: string };

export type Hoi4MapSnapshot = {
  status: Hoi4MapStatus;
  /** Countries that own land, with their names and map colors */
  countries: CountryDisplay[];
  /** The analysis of the save. It arrives after the game data loads. */
  overview: Hoi4Overview | null;
  /** The asset bundle version that the map uses, if any */
  bundleVersion: string | null;
};

const NO_MATCH: MapMatch = { countries: [], states: [] };

/**
 * Coordinates the map worker and the save worker for one save.
 *
 * The map is optional: when the browser cannot render it, the session
 * reports the reason and the rest of the page keeps working.
 */
export class Hoi4MapSession {
  /** Owns the canvas, which stays with the session while the page shows it */
  readonly host: CanvasCourierHost;
  private snapshot: Hoi4MapSnapshot = {
    status: { kind: "waiting" },
    countries: [],
    overview: null,
    bundleVersion: null,
  };
  private mode: MapMode = "political";
  private focus: MapMatch = NO_MATCH;
  private hoverMatch: MapMatch = NO_MATCH;
  private modeSequence = 0;
  private listeners = new Set<() => void>();
  // The hovered province changes often, so it has a store that is separate
  // from the snapshot. Thus a hover does not render the side panel again.
  private hovered: ProvinceDetails | null = null;
  private hoverListeners = new Set<() => void>();
  private surface: CanvasCourierSurface | null = null;
  private meta: Hoi4Metadata | null = null;
  private started = false;
  private destroyed = false;
  private transport: CanvasCourierTransport | null = null;
  private rawWorker: Worker | null = null;
  private mapWorker: Remote<typeof MapModule> | null = null;
  private hoverSequence = 0;
  private highlightSequence = 0;
  private unregisterTerminator: () => void;
  private onSelectProvince: ((province: ProvinceDetails) => void) | null = null;

  constructor(readonly file: File) {
    this.host = new CanvasCourierHost(CANVAS_CLASS, (surface, transport) =>
      this.attachMap(surface, transport),
    );
    // End the map when the input changes, unless the input is still this save.
    this.unregisterTerminator = registerAnalysisTerminator(({ from, to }) => {
      if (from?.kind !== "hoi4" || (to?.kind === "hoi4" && to.file === this.file)) {
        return false;
      }
      terminateHoi4MapSession();
      return true;
    });
  }

  getSnapshot = (): Hoi4MapSnapshot => this.snapshot;

  /** Listen for clicks on land. Returns an unsubscribe function. */
  listenForProvinceClicks(listener: (province: ProvinceDetails) => void): () => void {
    this.onSelectProvince = listener;
    return () => {
      if (this.onSelectProvince === listener) {
        this.onSelectProvince = null;
      }
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The province under the cursor */
  getHovered = (): ProvinceDetails | null => this.hovered;

  subscribeHover = (listener: () => void): (() => void) => {
    this.hoverListeners.add(listener);
    return () => {
      this.hoverListeners.delete(listener);
    };
  };

  /** Start the map when the host gives it a canvas */
  private attachMap(surface: CanvasCourierSurface, transport: CanvasCourierTransport): void {
    this.surface = surface;
    this.transport = transport;
    void this.start();
  }

  /** Start loading once the save is parsed */
  setSave(meta: Hoi4Metadata): void {
    this.meta = meta;
    void this.start();
  }

  /** Color the map by `mode`. The focus and hover stay. */
  async setMode(mode: MapMode): Promise<void> {
    if (mode === this.mode) {
      return;
    }
    this.mode = mode;
    const sequence = ++this.modeSequence;
    if (this.snapshot.status.kind !== "ready" || this.mapWorker === null) {
      return;
    }

    const arrays = await getHoi4Worker().locationArrays(mode);
    if (sequence === this.modeSequence && !this.destroyed) {
      await this.mapWorker.syncLocations(transfer(arrays, [arrays.buffer]));
      await this.syncMatch();
    }
  }

  /** Dim the land outside `focus` and light the land in `hover` */
  async setMatch(focus: MapMatch | null, hover: MapMatch | null): Promise<void> {
    this.focus = focus ?? NO_MATCH;
    this.hoverMatch = hover ?? NO_MATCH;
    await this.syncMatch();
  }

  private async syncMatch(): Promise<void> {
    const sequence = ++this.highlightSequence;
    if (this.snapshot.status.kind !== "ready" || this.mapWorker === null) {
      return;
    }

    const flags = await getHoi4Worker().matchFlags(this.focus, this.hoverMatch);
    if (sequence === this.highlightSequence && !this.destroyed) {
      await this.mapWorker.syncFlags(transfer(flags, [flags.buffer]));
    }
  }

  /** The whole world as a PNG */
  async screenshot(fullResolution: boolean): Promise<Blob> {
    if (this.mapWorker === null) {
      throw new Error("The map is not available");
    }
    return this.mapWorker.generateWorldScreenshot(fullResolution);
  }

  /** Center the map on the capital of `tag` */
  async centerOnCountry(tag: string): Promise<void> {
    const province = await getHoi4Worker().capitalProvince(tag);
    if (province !== null) {
      await this.mapWorker?.centerOnProvince(province);
    }
  }

  private async start(): Promise<void> {
    if (
      this.started ||
      this.surface === null ||
      this.transport === null ||
      this.meta === null ||
      this.destroyed
    ) {
      return;
    }
    this.started = true;
    const surface = this.surface;
    const transport = this.transport;
    const meta = this.meta;

    const saveWorker = getHoi4Worker();
    const bundle = resolveHoi4Bundle(meta.bundleVersion);
    if (bundle === null) {
      // The analysis does not need the map. It names countries by tag.
      await saveWorker.loadWithoutGameBundle();
      const overview = await saveWorker.overview();
      this.update({
        overview,
        status: {
          kind: "unavailable",
          reason: `No map assets match this save${meta.version ? ` (${meta.version})` : ""}.`,
        },
      });
      return;
    }

    this.update({ status: { kind: "loading" }, bundleVersion: bundle.version });
    // This handles its own failure, because the paths below that stop
    // early do not await it.
    const countriesLoaded = saveWorker.loadGameBundle(bundle.game).then(
      async (countries) => {
        const overview = await saveWorker.overview();
        if (!this.destroyed) {
          this.update({ countries, overview });
        }
        return true;
      },
      (error: unknown) => {
        if (!this.destroyed) {
          captureException(error);
          this.update({ status: { kind: "unavailable", reason: getErrorMessage(error) } });
        }
        return false;
      },
    );

    try {
      if (!isWebGPUSupported()) {
        this.update({ status: { kind: "unavailable", reason: GPU_UNAVAILABLE } });
        return;
      }

      this.rawWorker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      trackWorker(this.rawWorker);
      const mapWorker = wrap<typeof MapModule>(this.rawWorker);
      this.mapWorker = mapWorker;

      await mapWorker.createMap(
        transfer(
          {
            canvas: surface.offscreen,
            display: transport.currentSize(),
            inputConfig: transport.inputConfig,
            mapUrl: bundle.map,
            logLevel: getLogLevel(),
          },
          [surface.offscreen],
        ),
        proxy({
          onHover: (provinceId: number) => void this.hover(provinceId),
          onClick: (provinceId: number) => void this.click(provinceId),
        }),
      );

      if (!(await countriesLoaded)) {
        this.releaseMap();
        return;
      }
      const arrays = await saveWorker.locationArrays(this.mode);
      await mapWorker.syncLocations(transfer(arrays, [arrays.buffer]));

      const capital = meta.player ? await saveWorker.capitalProvince(meta.player) : null;
      if (capital !== null) {
        await mapWorker.centerOnProvince(capital);
      }

      if (!this.destroyed) {
        this.update({ status: { kind: "ready" } });
        // A mode or focus chosen while the map loaded applies now.
        const mode = this.mode;
        this.mode = "political";
        await this.setMode(mode);
        await this.syncMatch();
      }
    } catch (error) {
      if (this.destroyed) {
        return;
      }

      this.releaseMap();
      const message = getErrorMessage(error);
      if (message.includes("Failed to initialize GPU")) {
        // An expected outcome on devices without a WebGPU adapter.
        console.warn(message);
        this.update({ status: { kind: "unavailable", reason: GPU_UNAVAILABLE } });
      } else {
        captureException(error);
        this.update({ status: { kind: "unavailable", reason: message } });
      }
    }
  }

  private async hover(provinceId: number): Promise<void> {
    const sequence = ++this.hoverSequence;
    const hovered = provinceId === 0 ? null : await getHoi4Worker().provinceDetails(provinceId);
    if (sequence === this.hoverSequence && !this.destroyed) {
      this.hovered = hovered;
      this.hoverListeners.forEach((listener) => listener());
    }
  }

  private async click(provinceId: number): Promise<void> {
    if (provinceId === 0) {
      return;
    }

    const details = await getHoi4Worker().provinceDetails(provinceId);
    if (details?.owner && !this.destroyed) {
      this.onSelectProvince?.(details);
    }
  }

  private releaseMap(): void {
    this.rawWorker?.terminate();
    this.rawWorker = null;
    this.mapWorker = null;
  }

  destroy(): void {
    this.destroyed = true;
    this.unregisterTerminator();
    this.releaseMap();
    this.host.dispose();
    this.listeners.clear();
    this.hoverListeners.clear();
  }

  private update(next: Partial<Hoi4MapSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((listener) => listener());
  }
}

let currentSession: Hoi4MapSession | null = null;

export function getHoi4MapSession(file: File): Hoi4MapSession {
  if (currentSession?.file === file) {
    return currentSession;
  }

  terminateHoi4MapSession();
  currentSession = new Hoi4MapSession(file);
  return currentSession;
}

export function terminateHoi4MapSession(): void {
  const session = currentSession;
  currentSession = null;
  session?.destroy();
}
