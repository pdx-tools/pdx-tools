import { CanvasCourierHost } from "@/lib/canvas_courier";
import type { CanvasCourierSurface, CanvasCourierTransport } from "@/lib/canvas_courier";
import { captureException } from "@/lib/captureException";
import { isWebGPUSupported } from "@/lib/compatibility";
import { emitEvent } from "@/lib/events";
import { registerAnalysisTerminator } from "@/features/engine/analysisLifecycle";
import type { SaveGameInput } from "@/features/engine/engineStore";
import { takeCampaignCarry } from "@/features/campaign/carry";
import { toPlaythroughId } from "@/features/campaign/types";
import { applyEu5Carry } from "../campaignCarry";
import { Eu5GameAdapter } from "../game-adapter";
import { openEngine, readSaveData } from "../ui-engine";
import { createEu5Store, eu5ViewState } from "./eu5Store";
import type { Eu5Store } from "./eu5Store";
import { sameEu5Save } from "./types";
import type { Eu5SaveData, Eu5SaveInput } from "./types";
import { initialEu5SessionSnapshot } from "./eu5SessionState";
import type { Eu5SessionSnapshot } from "./eu5SessionState";

export type { Eu5LoadingState, Eu5SessionSnapshot } from "./eu5SessionState";

const CANVAS_CLASS = "h-full w-full touch-none outline-none";

/**
 * How long a session that no page shows stays, so that a page that
 * mounts again, such as in the development double mount, keeps it.
 */
const UNCLAIMED_MS = 1_000;

/**
 * The EU5 analysis of one campaign: the canvas, the workers, and the save
 * on screen. A step to the next save of the campaign on the same route
 * keeps the session, so the map stays on screen.
 */
class Eu5Session {
  readonly host: CanvasCourierHost;

  private snapshot: Eu5SessionSnapshot = initialEu5SessionSnapshot;
  private listeners = new Set<() => void>();
  private unregisterTerminator: () => void;
  private workers: Eu5GameAdapter | null = null;

  /** Each load gets a number. A load that a later one replaced stops. */
  private generation = 0;
  /** The loads in order, so the worker parses one save at a time. */
  private queue: Promise<void> = Promise.resolve();
  /**
   * The saves that a page can show with the session. These are the save
   * on screen, and the save of a step until the page goes to it.
   */
  private pageSaves: Eu5SaveInput[];
  /** The pages that show the session. */
  private claims = 0;
  /** Set while no page shows the session, until it ends. */
  private unclaimed: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private pendingStep: {
    save: Eu5SaveInput;
    resolve: () => void;
    reject: (error: unknown) => void;
  } | null = null;

  constructor(private save: Eu5SaveInput) {
    this.pageSaves = [save];
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

  /** True when a page can show the save with the session. */
  shows(save: Eu5SaveInput): boolean {
    return this.pageSaves.some((x) => sameEu5Save(x, save));
  }

  /**
   * Load the next save before the page changes its input or route.
   * Resolve when the save is on screen. On failure, restore the previous
   * save before rejection. If recovery fails, show the load error.
   */
  async step(save: Eu5SaveInput): Promise<void> {
    if (this.destroyed) throw new DOMException("The session ended", "AbortError");
    if (this.snapshot.stepping || this.pendingStep !== null) {
      throw new Error("A save is already loading");
    }
    if (this.shows(save)) return;
    const generation = ++this.generation;
    this.update({ stepping: true, error: null });

    let source: Eu5SaveData;
    try {
      source = await readSaveData(save);
    } catch (error) {
      if (this.isCurrent(generation)) this.update({ stepping: false });
      throw error;
    }

    if (!this.isCurrent(generation)) {
      throw new DOMException("The load was replaced", "AbortError");
    }
    const completion = Promise.withResolvers<void>();
    this.pendingStep = { save, resolve: () => completion.resolve(), reject: completion.reject };
    this.save = save;
    this.pageSaves = [...this.pageSaves, save];
    this.enqueue((generation) => this.loadInPlace(save, source, generation));
    await completion.promise;
  }

  /**
   * A page shows the save with the session. The session then drops the
   * other saves, such as the save before a step. The page calls the
   * returned function when it goes. When no page shows the session, the
   * session ends.
   */
  claim(save: Eu5SaveInput): () => void {
    this.pageSaves = [save];
    this.claims += 1;
    if (this.unclaimed !== null) {
      clearTimeout(this.unclaimed);
      this.unclaimed = null;
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.claims -= 1;
      if (this.claims === 0) {
        this.unclaimed = setTimeout(() => endSession(this), UNCLAIMED_MS);
      }
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation += 1;
    this.rejectStep(new DOMException("The session ended", "AbortError"));
    if (this.unclaimed !== null) clearTimeout(this.unclaimed);
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

  /**
   * The end of the analysis, unless the page goes to the save that the
   * session shows. A step loads that save before the page input changes.
   */
  private terminate(next: SaveGameInput | null): boolean {
    if (next?.kind === "eu5" && this.shows(next.data)) return false;

    endSession(this);
    return true;
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
          this.rejectStep(error);
        }
      }
    });
  }

  /** A new canvas is in the page: start the workers and a map on it. */
  private startMap(surface: CanvasCourierSurface, transport: CanvasCourierTransport): void {
    if (this.destroyed) return;
    if (!isWebGPUSupported()) {
      const error = new Error("WebGPU is not supported in your browser");
      this.update({ loading: null, stepping: false, error });
      this.rejectStep(error);
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

    const opened = await openEngine(game);
    if (!this.isCurrent(generation)) {
      opened.engine.destroy();
      return;
    }

    // A step from another save of the campaign keeps its view.
    const carry = takeCampaignCarry("eu5", toPlaythroughId(opened.playthroughId));
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
   * keeps the open save, and the camera does not move. This continues until
   * the next save has the map mode and selection of the open save.
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

    try {
      await this.showInPlace(workers, save, source, previous, generation);
    } catch (error) {
      if (!this.isCurrent(generation)) return;
      // The worker closed the open save before it parsed the next one, so
      // the open save loads again. A failure here ends in the error page.
      const { input, saveInput } = previous.getState();
      this.save = input;
      this.pageSaves = [input];
      await this.showInPlace(workers, input, await readSaveData(saveInput), previous, generation);
      if (this.isCurrent(generation)) this.rejectStep(error);
    }
  }

  /** Load a save into the map on screen, in place of `previous`. */
  private async showInPlace(
    workers: Eu5GameAdapter,
    save: Eu5SaveInput,
    source: Eu5SaveData,
    previous: Eu5Store,
    generation: number,
  ): Promise<void> {
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

    const opened = await openEngine(game, {
      ownerBordersEnabled: previous.getState().appState.ownerBordersEnabled,
    });
    if (!this.isCurrent(generation)) {
      opened.engine.destroy();
      return;
    }

    const carry = takeCampaignCarry("eu5", toPlaythroughId(opened.playthroughId));
    if (carry !== null) {
      // The camera is already where the player left it.
      await this.applyCarry(opened.engine, { ...carry, viewport: null });
    }

    await game.show();
    if (!this.isCurrent(generation)) {
      opened.engine.destroy();
      return;
    }

    const store = createEu5Store({
      opened,
      input: save,
      saveInput: source.save,
      view: eu5ViewState(previous),
    });
    this.show(store);
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
    const step = this.pendingStep;
    if (step !== null && sameEu5Save(step.save, store.getState().input)) {
      this.pendingStep = null;
      step.resolve();
    }
  }

  private rejectStep(error: unknown): void {
    const step = this.pendingStep;
    this.pendingStep = null;
    step?.reject(error);
  }

  private update(next: Partial<Eu5SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((listener) => listener());
  }
}

let currentSession: Eu5Session | null = null;
const sessionListeners = new Set<() => void>();

function setCurrentSession(session: Eu5Session | null): void {
  currentSession = session;
  sessionListeners.forEach((listener) => listener());
}

function endSession(session: Eu5Session): void {
  if (currentSession === session) {
    setCurrentSession(null);
  }
  session.destroy();
}

/** Call the listener when the current session changes. */
export function subscribeEu5Session(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

/** The current session when a page can show the save with it. */
export function findEu5Session(save: Eu5SaveInput): Eu5Session | null {
  return currentSession?.shows(save) ? currentSession : null;
}

/** The session of the save: the current one when it shows the save, else a new one. */
export function getEu5Session(save: Eu5SaveInput): Eu5Session {
  const found = findEu5Session(save);
  if (found !== null) {
    return found;
  }

  terminateEu5Session();
  const session = new Eu5Session(save);
  setCurrentSession(session);
  return session;
}

/**
 * Open the next save of the campaign in the current session, before the
 * page goes to that save on the same route.
 */
export async function stepEu5Session(save: Eu5SaveInput): Promise<void> {
  if (currentSession === null) throw new Error("No EU5 session is open");
  await currentSession.step(save);
}

export function terminateEu5Session(): void {
  const session = currentSession;
  if (session !== null) {
    endSession(session);
  }
}
