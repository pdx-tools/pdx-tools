import { connectAnalysisFrames } from "../history/analysisClient";
import { useHistory } from "../history/store";
import { CanvasCourierHost } from "@/lib/canvas_courier";
import type { CanvasCourierSurface, CanvasCourierTransport } from "@/lib/canvas_courier";
import { captureException } from "@/lib/captureException";
import { isWebGPUSupported } from "@/lib/compatibility";
import { emitEvent } from "@/lib/events";
import { registerAnalysisTerminator } from "@/features/engine/analysisLifecycle";
import type { AnalysisChange } from "@/features/engine/analysisLifecycle";
import { campaignTransitions } from "@/features/campaign/transitions";
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

/** Allow a short gap between page owners before releasing the session. */
const UNCLAIMED_MS = 1_000;

/** Keep the canvas and workers available across compatible save changes. */
class Eu5Session {
  readonly host: CanvasCourierHost;

  private snapshot: Eu5SessionSnapshot = initialEu5SessionSnapshot;
  private listeners = new Set<() => void>();
  private unregisterTerminator: () => void;
  private workers: Eu5GameAdapter | null = null;

  /** Reject work superseded by a newer load. */
  private generation = 0;
  /** Serialize loads to limit memory use. */
  private queue: Promise<void> = Promise.resolve();
  /** Allow both page owners during a save transition. */
  private pageSaves: Eu5SaveInput[];

  private claims = 0;

  private unclaimed: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private pendingStep: {
    save: Eu5SaveInput;
    /** The save to restore if the step fails. */
    fallback: Eu5SaveInput;
    /** The step failure, kept until the fallback save shows. */
    failure: { error: unknown } | null;
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

  shows(save: Eu5SaveInput): boolean {
    return this.pageSaves.some((x) => sameEu5Save(x, save));
  }

  /** Prepare the next save before navigation. Restore the current save if preparation fails. */
  async step(save: Eu5SaveInput): Promise<void> {
    if (this.destroyed) throw new DOMException("The session ended", "AbortError");
    if (this.snapshot.status === "error") throw new Error("No save is open");
    if (this.snapshot.status === "pending" || this.snapshot.stepping || this.pendingStep !== null) {
      throw new Error("A save is already loading");
    }
    if (this.shows(save)) return;
    const generation = ++this.generation;
    this.setStepping(true);

    let source: Eu5SaveData;
    try {
      source = await readSaveData(save);
    } catch (error) {
      if (this.isCurrent(generation)) this.setStepping(false);
      throw error;
    }

    if (!this.isCurrent(generation)) {
      throw new DOMException("The load was replaced", "AbortError");
    }
    const completion = Promise.withResolvers<void>();
    this.pendingStep = {
      save,
      fallback: this.save,
      failure: null,
      resolve: () => completion.resolve(),
      reject: completion.reject,
    };
    this.save = save;
    this.pageSaves = [...this.pageSaves, save];
    this.enqueue((generation) => this.loadInPlace(save, source, generation));
    await completion.promise;
  }

  /** Retain the session while a page owns it. Return a function that releases ownership. */
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
      this.shown()?.getState().engine.destroy();
      this.workers?.terminate();
      this.host.dispose();
    } catch (error) {
      captureException(error);
    } finally {
      this.workers = null;
      this.listeners.clear();
    }
  }

  /** Keep the session when the next input uses it or another route owns it. */
  private terminate({ from, to }: AnalysisChange): boolean {
    if (from?.kind !== "eu5" || !this.shows(from.data)) return false;
    if (to?.kind === "eu5" && this.shows(to.data)) return false;

    endSession(this);
    return true;
  }

  private isCurrent(generation: number): boolean {
    return !this.destroyed && generation === this.generation;
  }

  private enqueue(load: (generation: number) => Promise<void>): void {
    const generation = ++this.generation;
    this.queue = this.queue.then(async () => {
      if (!this.isCurrent(generation)) return;
      try {
        await load(generation);
      } catch (error) {
        if (!this.isCurrent(generation)) return;
        const step = this.pendingStep;
        if (step !== null && step.failure === null) {
          // A step can replace the map. Load the current save again on a new map.
          step.failure = { error };
          step.save = step.fallback;
          this.save = step.fallback;
          this.pageSaves = [step.fallback];
          this.host.renew();
          return;
        }
        this.update({ status: "error", error });
        this.rejectStep(error);
      }
    });
  }

  /** Recreate workers when the canvas is replaced. */
  private startMap(surface: CanvasCourierSurface, transport: CanvasCourierTransport): void {
    if (this.destroyed) return;
    if (!isWebGPUSupported()) {
      const error = new Error("WebGPU is not supported in your browser");
      this.update({ status: "error", error });
      this.rejectStep(error);
      return;
    }

    this.workers?.terminate();
    const workers = Eu5GameAdapter.create();
    this.workers = workers;
    const save = this.save;
    this.enqueue((generation) => this.loadNewMap(workers, save, surface, transport, generation));
  }

  private async loadNewMap(
    workers: Eu5GameAdapter,
    save: Eu5SaveInput,
    surface: CanvasCourierSurface,
    transport: CanvasCourierTransport,
    generation: number,
  ): Promise<void> {
    this.update({ status: "pending", progress: { percent: 0, stage: "Starting workers" } });

    const source = readSaveData(save);
    const game = await workers.start(
      {
        canvas: surface.offscreen,
        display: transport.currentSize(),
        inputConfig: transport.inputConfig,
        save: source,
      },
      (increment, stage) => {
        if (!this.isCurrent(generation) || this.snapshot.status !== "pending") return;
        const percent = Math.min(100, this.snapshot.progress.percent + increment);
        this.update({ status: "pending", progress: { percent, stage } });
      },
    );

    const opened = await openEngine(game);
    if (!this.isCurrent(generation)) {
      opened.engine.destroy();
      return;
    }

    const carry = campaignTransitions.takeView("eu5", opened.playthroughId);
    const reload = this.pendingStep?.failure != null;
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
    this.show(createEu5Store({ opened, input: save, saveInput, view }), {
      reload,
    });
  }

  /** Keep the current map visible until the replacement view is ready. */
  private async loadInPlace(
    save: Eu5SaveInput,
    source: Eu5SaveData,
    generation: number,
  ): Promise<void> {
    const workers = this.workers;
    const previous = this.shown();
    if (workers === null || !workers.mapStarted || previous === null) {
      this.host.renew();
      return;
    }

    const { engine: previousEngine, appState } = previous.getState();
    previousEngine.destroy();
    // Clear hover state before suspending input.
    previous.setState({ appState: { ...appState, hoverDisplayData: null } });
    this.setStepping(true);

    try {
      await this.showInPlace(workers, save, source, previous, generation);
    } catch (error) {
      if (!this.isCurrent(generation)) return;
      // Recover the current save if loading its replacement fails.
      const { input, saveInput } = previous.getState();
      this.save = input;
      this.pageSaves = [input];
      const data = await readSaveData(saveInput);
      await this.showInPlace(workers, input, data, previous, generation, { reload: true });
      if (this.isCurrent(generation)) this.rejectStep(error);
    }
  }

  /** Replace the displayed save, or restore it after a failed step. */
  private async showInPlace(
    workers: Eu5GameAdapter,
    save: Eu5SaveInput,
    source: Eu5SaveData,
    previous: Eu5Store,
    generation: number,
    { reload = false }: { reload?: boolean } = {},
  ): Promise<void> {
    const game = await workers.load(source);
    if (game === null) {
      // Different map bundles require a new canvas.
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

    // A parser already in flight cannot be interrupted. If playback resumed,
    // adopt its engine only after painting the latest analytical observation.
    // Publishing the obsolete full-save map would jump the playhead backwards.
    const history = useHistory.getState();
    const settling = history.settlingObservation;
    const selected = opened.playthroughId
      ? history.selectedObservations[opened.playthroughId]
      : undefined;
    if (
      opened.playthroughId &&
      settling?.campaignId === opened.playthroughId &&
      selected &&
      selected !== settling.hash
    ) {
      const original =
        history.previewCarries[opened.playthroughId] ??
        campaignTransitions.takeView("eu5", opened.playthroughId);
      if (original)
        await this.applyCarry(opened.engine, {
          ...original,
          inspection: undefined,
          mapMode: previous.getState().appState.currentMapMode,
          viewport: null,
        });
      else await opened.engine.trigger.selectMapMode(previous.getState().appState.currentMapMode);
      const disconnect = await connectAnalysisFrames(opened.engine.trigger.connectMapFrames);
      try {
        let painted: string;
        do {
          painted = useHistory.getState().selectedObservations[opened.playthroughId];
          const frame = useHistory.getState().snapshots.find((row) => row.hash === painted);
          if (!frame || !frame.layoutKey || !frame.world)
            throw new DOMException("Observation removed", "AbortError");
          await opened.engine.trigger.showMapProjection({
            ...frame,
            layoutKey: frame.layoutKey,
            world: frame.world,
          });
        } while (
          this.isCurrent(generation) &&
          painted !== useHistory.getState().selectedObservations[opened.playthroughId]
        );
        if (!this.isCurrent(generation)) {
          opened.engine.destroy();
          return;
        }
        await game.show();
        this.rejectStep(new DOMException("Selected observation changed", "AbortError"));
        this.show(
          createEu5Store({
            opened,
            input: save,
            saveInput: source.save,
            view: eu5ViewState(previous),
          }),
          { reload: true },
        );
      } finally {
        disconnect();
      }
      return;
    }
    const carry = campaignTransitions.takeView("eu5", opened.playthroughId);
    if (carry !== null) {
      // The retained canvas already has the current camera position.
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
    this.show(store, { reload });
  }

  private async applyCarry(...args: Parameters<typeof applyEu5Carry>): Promise<void> {
    try {
      await applyEu5Carry(...args);
    } catch (error) {
      captureException(error, { tags: { msg: "campaign-carry" } });
      return;
    }
  }

  /** Exclude recovery loads from parse analytics. */
  private show(store: Eu5Store, { reload = false }: { reload?: boolean } = {}): void {
    if (!reload) {
      emitEvent({
        kind: "Save parsed",
        game: "eu5",
        source: store.getState().input.kind === "server" ? "remote" : "local",
      });
    }
    this.update({ status: "success", data: store, stepping: false });
    const step = this.pendingStep;
    if (step !== null && sameEu5Save(step.save, store.getState().input)) {
      this.pendingStep = null;
      if (step.failure === null) step.resolve();
      else step.reject(step.failure.error);
    }
  }

  private rejectStep(error: unknown): void {
    const step = this.pendingStep;
    this.pendingStep = null;
    step?.reject(error);
  }

  private shown(): Eu5Store | null {
    return this.snapshot.status === "success" ? this.snapshot.data : null;
  }

  private setStepping(stepping: boolean): void {
    if (this.snapshot.status === "success") this.update({ ...this.snapshot, stepping });
  }

  private update(next: Eu5SessionSnapshot): void {
    this.snapshot = next;
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

export function subscribeEu5Session(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

export function findEu5Session(save: Eu5SaveInput): Eu5Session | null {
  return currentSession?.shows(save) ? currentSession : null;
}

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

/** Prepare a save in the current session before changing pages. */
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

/** The fully loaded view after a campaign step finishes. */
export function activeEu5Store(): Eu5Store | null {
  const snapshot = currentSession?.getSnapshot();
  return snapshot?.status === "success" ? snapshot.data : null;
}
