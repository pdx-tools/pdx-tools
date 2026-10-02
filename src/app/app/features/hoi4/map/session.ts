import { proxy, transfer, wrap } from "comlink";
import type { Remote } from "comlink";
import { CanvasCourierTransport } from "@/lib/canvas_courier";
import type { CanvasCourierController, CanvasCourierSurface } from "@/lib/canvas_courier";
import { captureException } from "@/lib/captureException";
import { isWebGPUSupported } from "@/lib/compatibility";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { getLogLevel } from "@/lib/isDeveloper";
import { trackWorker } from "@/lib/sentryWorker";
import { registerAnalysisTerminator } from "@/features/engine/analysisLifecycle";
import { getHoi4Worker } from "../worker";
import type { CountryDisplay, Hoi4Metadata, ProvinceDetails } from "../worker/types";
import { resolveHoi4Bundle } from "./bundles";
import type * as MapModule from "./map-module";

const GPU_UNAVAILABLE = "This browser or device does not support WebGPU.";

export type Hoi4MapStatus =
  | { kind: "waiting" }
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "unavailable"; reason: string };

export type Hoi4MapSnapshot = {
  status: Hoi4MapStatus;
  /** Countries that own land, with their names and map colors */
  countries: CountryDisplay[];
};

/**
 * Coordinates the map worker and the save worker for one save.
 *
 * The map is optional: when the browser cannot render it, the session
 * reports the reason and the rest of the page keeps working.
 */
export class Hoi4MapSession implements CanvasCourierController {
  private snapshot: Hoi4MapSnapshot = { status: { kind: "waiting" }, countries: [] };
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
  private onSelectCountry: ((tag: string) => void) | null = null;

  constructor(readonly file: File) {
    this.unregisterTerminator = registerAnalysisTerminator(terminateHoi4MapSession);
  }

  getSnapshot = (): Hoi4MapSnapshot => this.snapshot;

  /** Listen for clicks on provinces that a country owns. Returns an unsubscribe function. */
  listenForCountryClicks(listener: (tag: string) => void): () => void {
    this.onSelectCountry = listener;
    return () => {
      if (this.onSelectCountry === listener) {
        this.onSelectCountry = null;
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

  attachSurface(surface: CanvasCourierSurface): void {
    this.surface = surface;
    void this.start();
  }

  /** Start loading once the save is parsed */
  setSave(meta: Hoi4Metadata): void {
    this.meta = meta;
    void this.start();
  }

  /** Highlight the provinces that `tag` owns. Null removes the highlight. */
  async highlightCountry(tag: string | null): Promise<void> {
    const sequence = ++this.highlightSequence;
    if (this.snapshot.status.kind !== "ready" || this.mapWorker === null) {
      return;
    }

    const flags = await getHoi4Worker().locationFlags(tag);
    if (sequence === this.highlightSequence && !this.destroyed) {
      await this.mapWorker.syncFlags(transfer(flags, [flags.buffer]));
    }
  }

  /** Center the map on the capital of `tag` */
  async centerOnCountry(tag: string): Promise<void> {
    const province = await getHoi4Worker().capitalProvince(tag);
    if (province !== null) {
      await this.mapWorker?.centerOnProvince(province);
    }
  }

  private async start(): Promise<void> {
    if (this.started || this.surface === null || this.meta === null || this.destroyed) {
      return;
    }
    this.started = true;
    const surface = this.surface;
    const meta = this.meta;

    const bundle = resolveHoi4Bundle(meta.bundleVersion);
    if (bundle === null) {
      this.update({
        status: { kind: "unavailable", reason: "The HOI4 map assets are not available." },
      });
      return;
    }

    this.update({ status: { kind: "loading" } });
    const saveWorker = getHoi4Worker();
    // This handles its own failure, because the paths below that stop
    // early do not await it.
    const countriesLoaded = saveWorker.loadGameBundle(bundle.game).then(
      (countries) => {
        if (!this.destroyed) {
          this.update({ countries });
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

      this.transport = new CanvasCourierTransport();
      this.transport.attachSurface({ canvas: surface.canvas });

      this.rawWorker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      trackWorker(this.rawWorker);
      const mapWorker = wrap<typeof MapModule>(this.rawWorker);
      this.mapWorker = mapWorker;

      await mapWorker.createMap(
        transfer(
          {
            canvas: surface.offscreen,
            display: this.transport.currentSize(),
            inputConfig: this.transport.inputConfig,
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
      const arrays = await saveWorker.locationArrays();
      await mapWorker.syncLocations(transfer(arrays, [arrays.buffer]));

      const capital = meta.player ? await saveWorker.capitalProvince(meta.player) : null;
      if (capital !== null) {
        await mapWorker.centerOnProvince(capital);
      }

      if (!this.destroyed) {
        this.update({ status: { kind: "ready" } });
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
      this.onSelectCountry?.(details.owner.tag);
    }
  }

  private releaseMap(): void {
    try {
      this.transport?.dispose();
    } catch (error) {
      captureException(error);
    }
    this.rawWorker?.terminate();
    this.transport = null;
    this.rawWorker = null;
    this.mapWorker = null;
  }

  destroy(): void {
    this.destroyed = true;
    this.unregisterTerminator();
    this.releaseMap();
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
