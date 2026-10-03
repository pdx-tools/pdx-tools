import { CanvasCourierHost } from "@/lib/canvas_courier";
import type { CanvasCourierSurface, CanvasCourierTransport } from "@/lib/canvas_courier";
import { captureException } from "@/lib/captureException";
import { isWebGPUSupported } from "@/lib/compatibility";
import { emitEvent } from "@/lib/events";
import { registerAnalysisTerminator } from "@/features/engine/analysisLifecycle";
import type { SaveGameInput } from "@/features/engine/engineStore";
import { takeCampaignCarry } from "@/features/campaign/carry";
import { toCampaignId } from "@/features/campaign/types";
import { applyEu5Carry } from "../campaignCarry";
import type { Eu5Carry } from "../campaignCarry";
import { Eu5GameAdapter } from "../game-adapter";
import { openEngine, readSaveData } from "../ui-engine";
import { createEu5Store, eu5ViewState } from "./eu5Store";
import type { Eu5Store } from "./eu5Store";
import { sameEu5Save } from "./types";
import type { Eu5SaveData, Eu5SaveInput } from "./types";

export type Eu5LoadingState = {
  percent: number;
  stage: string;
};

type Eu5SessionSnapshot = {
  /**
   * The save on screen. A step to the next save of the campaign keeps the
   * previous save here until the next one is ready.
   */
  data: Eu5Store | null;
  /** The progress of a load that starts a new map. */
  loading: Eu5LoadingState | null;
  /** A save of the campaign loads into the map on screen. */
  stepping: boolean;
  error: unknown;
};

const CANVAS_CLASS = "h-full w-full touch-none outline-none";

/**
 * How long a step holds the session for the page of the next save. A page
 * that does not come, such as an upload that the server deleted, frees it.
 */
const STEP_HANDOFF_MS = 30_000;

/**
 * The EU5 analysis of one campaign: the canvas, the workers, and the save
 * on screen. It outlives the page that shows it, so that a step to the next
 * save of the campaign keeps the map, even on another route.
 */
class Eu5Session {
  readonly host: CanvasCourierHost;

  private snapshot: Eu5SessionSnapshot = {
    data: null,
    loading: { percent: 0, stage: "Starting workers" },
    stepping: false,
    error: null,
  };
  private listeners = new Set<() => void>();
  private unregisterTerminator: () => void;
  private workers: Eu5GameAdapter | null = null;

  /** Each load gets a number. A load that a later one replaced stops. */
  private generation = 0;
  /** The loads in order, so the worker parses one save at a time. */
  private queue: Promise<void> = Promise.resolve();
  /** Set while a step waits for the page of the next save to take it. */
  private handoff: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(private save: Eu5SaveInput) {
    this.unregisterTerminator = registerAnalysisTerminator((next) => this.terminate(next));
    this.host = new CanvasCourierHost(CANVAS_CLASS, (surface, transport) =>
      this.startMap(surface, transport),
    );
  }

  getSnapshot = (): Eu5SessionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** True when the session shows the save or loads it. */
  shows(save: Eu5SaveInput): boolean {
    return sameEu5Save(this.save, save);
  }

  /**
   * Open the next save of the campaign in place of the open one. Resolves
   * once the next save is read; rejects when it cannot be read, and the
   * open save then stays. The map and the page stay, and change to the
   * next save once it is ready. The session waits for the page of that
   * save, which can be on another route, and the analysis does not end in
   * between.
   */
  async step(save: Eu5SaveInput): Promise<void> {
    if (this.destroyed || this.shows(save)) return;
    const generation = ++this.generation;
    this.update({ stepping: true, error: null });

    let source: Eu5SaveData;
    try {
      source = await readSaveData(save);
    } catch (error) {
      if (this.isCurrent(generation)) this.update({ stepping: false });
      throw error;
    }

    if (!this.isCurrent(generation)) return;
    this.save = save;
    this.holdForHandoff();
    this.enqueue((generation) => this.loadInPlace(save, source, generation));
  }

  /** A page shows the session, so a step that waited for it is done. */
  claim(): void {
    this.releaseHandoff();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation += 1;
    this.releaseHandoff();
    this.unregisterTerminator();

    try {
      this.snapshot.data?.getState().engine.destroy();
      this.workers?.terminate();
      this.host.dispose();
    } catch (error) {
      captureException(error);
    } finally {
      this.workers = null;
      this.listeners.clear();
    }
  }

  /** The end of the analysis, unless the page goes to the save of a step. */
  private terminate(next: SaveGameInput | null): boolean {
    const continues =
      this.handoff !== null && (next === null || (next.kind === "eu5" && this.shows(next.data)));
    if (continues) return false;

    endSession(this);
    return true;
  }

  private holdForHandoff(): void {
    this.releaseHandoff();
    this.handoff = setTimeout(() => {
      this.handoff = null;
      if (this.host.canvas?.isConnected !== true) {
        endSession(this);
      }
    }, STEP_HANDOFF_MS);
  }

  private releaseHandoff(): void {
    if (this.handoff !== null) {
      clearTimeout(this.handoff);
      this.handoff = null;
    }
  }

  private isCurrent(generation: number): boolean {
    return !this.destroyed && generation === this.generation;
  }

  /** Run a load after the loads before it. Only the latest load runs. */
  private enqueue(load: (generation: number) => Promise<void>): void {
    const generation = ++this.generation;
    this.queue = this.queue.then(async () => {
      if (!this.isCurrent(generation)) return;
      try {
        await load(generation);
      } catch (error) {
        if (this.isCurrent(generation)) {
          this.update({ data: null, loading: null, stepping: false, error });
        }
      }
    });
  }

  /** A new canvas is in the page: start the workers and a map on it. */
  private startMap(surface: CanvasCourierSurface, transport: CanvasCourierTransport): void {
    if (this.destroyed) return;
    if (!isWebGPUSupported()) {
      this.update({ loading: null, error: new Error("WebGPU is not supported in your browser") });
      return;
    }

    this.workers?.terminate();
    const workers = Eu5GameAdapter.create();
    this.workers = workers;
    const save = this.save;
    this.enqueue((generation) => this.loadNewMap(workers, save, surface, transport, generation));
  }

  /** Load a save with a new map: the first save, or a save of another patch. */
  private async loadNewMap(
    workers: Eu5GameAdapter,
    save: Eu5SaveInput,
    surface: CanvasCourierSurface,
    transport: CanvasCourierTransport,
    generation: number,
  ): Promise<void> {
    this.update({
      data: null,
      loading: { percent: 0, stage: "Starting workers" },
      stepping: false,
      error: null,
    });

    // The map starts while the save is read.
    const source = readSaveData(save);
    const game = await workers.start(
      {
        canvas: surface.offscreen,
        display: transport.currentSize(),
        inputConfig: transport.inputConfig,
        save: source,
      },
      (increment, stage) => {
        if (!this.isCurrent(generation)) return;
        const percent = Math.min(100, (this.snapshot.loading?.percent ?? 0) + increment);
        this.update({ loading: { percent, stage } });
      },
    );

    const opened = await openEngine(game, workers);
    if (!this.isCurrent(generation)) {
      opened.engine.destroy();
      return;
    }

    // A step from another save of the campaign keeps its view.
    const carry = takeCampaignCarry<Eu5Carry>("eu5", toCampaignId(opened.playthroughId));
    if (carry !== null) {
      await this.applyCarry(opened.engine, carry);
      if (!this.isCurrent(generation)) {
        opened.engine.destroy();
        return;
      }
    }

    const view = carry
      ? { insightPanelOpen: carry.insightPanel.open, insightPanelWidth: carry.insightPanel.width }
      : undefined;
    const { save: saveInput } = await source;
    this.show(createEu5Store({ opened, input: save, saveInput, view }));
  }

  /**
   * Load the next save of the campaign into the map on screen. The map
   * keeps the open save, and the camera does not move, until the next save
   * has the map mode and selection of the open one.
   */
  private async loadInPlace(
    save: Eu5SaveInput,
    source: Eu5SaveData,
    generation: number,
  ): Promise<void> {
    const workers = this.workers;
    const previous = this.snapshot.data;
    if (workers === null || !workers.mapStarted || previous === null) {
      this.host.renew();
      return;
    }

    const { engine: previousEngine, appState } = previous.getState();
    previousEngine.destroy();
    // The open save stops taking input, so its hover ends here.
    previous.setState({ appState: { ...appState, hoverDisplayData: null } });
    this.update({ stepping: true, error: null });

    const saveInput = source.save;
    const game = await workers.load(source);
    if (game === null) {
      // The save is of a patch with other map bundles, so a new map shows it.
      if (this.isCurrent(generation)) this.host.renew();
      return;
    }

    if (!this.isCurrent(generation)) {
      game.release();
      return;
    }

    const opened = await openEngine(game, workers, {
      ownerBordersEnabled: appState.ownerBordersEnabled,
    });
    if (!this.isCurrent(generation)) {
      opened.engine.destroy();
      return;
    }

    const carry = takeCampaignCarry<Eu5Carry>("eu5", toCampaignId(opened.playthroughId));
    if (carry !== null) {
      // The camera is already where the player left it.
      await this.applyCarry(opened.engine, { ...carry, viewport: null });
    }

    await game.show();
    if (!this.isCurrent(generation)) {
      opened.engine.destroy();
      return;
    }

    this.show(createEu5Store({ opened, input: save, saveInput, view: eu5ViewState(previous) }));
  }

  private async applyCarry(...args: Parameters<typeof applyEu5Carry>): Promise<void> {
    try {
      await applyEu5Carry(...args);
    } catch (error) {
      captureException(error, { tags: { msg: "campaign-carry" } });
    }
  }

  private show(store: Eu5Store): void {
    emitEvent({
      kind: "Save parsed",
      game: "eu5",
      source: store.getState().input.kind === "server" ? "remote" : "local",
    });
    this.update({ data: store, loading: null, stepping: false, error: null });
  }

  private update(next: Partial<Eu5SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((listener) => listener());
  }
}

let currentSession: Eu5Session | null = null;

function endSession(session: Eu5Session): void {
  if (currentSession === session) {
    currentSession = null;
  }
  session.destroy();
}

/** The session of the save: the current one when it shows the save, else a new one. */
export function getEu5Session(save: Eu5SaveInput): Eu5Session {
  if (currentSession?.shows(save)) {
    return currentSession;
  }

  terminateEu5Session();
  currentSession = new Eu5Session(save);
  return currentSession;
}

/**
 * Open the next save of the campaign in the current session, before the
 * page goes to that save.
 */
export async function stepEu5Session(save: Eu5SaveInput): Promise<void> {
  await currentSession?.step(save);
}

export function terminateEu5Session(): void {
  const session = currentSession;
  if (session !== null) {
    endSession(session);
  }
}
