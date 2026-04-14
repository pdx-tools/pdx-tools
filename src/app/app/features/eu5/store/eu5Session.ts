import { Eu5SurfaceController } from "../Eu5SurfaceController";
import { dequal } from "@/lib/dequal";
import { emitEvent } from "@/lib/events";
import { registerAnalysisTerminator } from "@/features/engine/analysisLifecycle";
import type { Eu5Store } from "./eu5Store";
import type { Eu5SaveInput } from "./types";

type Eu5SessionSnapshot = {
  data: Eu5Store | null;
  loading: { percent: number } | null;
  error: unknown;
};

class Eu5Session {
  private snapshot: Eu5SessionSnapshot = {
    data: null,
    loading: { percent: 0 },
    error: null,
  };
  private listeners = new Set<() => void>();
  private unregisterTerminator: () => void;

  readonly controller: Eu5SurfaceController;

  constructor(readonly save: Eu5SaveInput) {
    this.unregisterTerminator = registerAnalysisTerminator(terminateEu5Session);
    this.controller = new Eu5SurfaceController(save, {
      onProgress: (increment) => {
        this.updateSnapshot({
          loading: { percent: (this.snapshot.loading?.percent ?? 0) + increment },
        });
      },
      onError: (error) => {
        this.updateSnapshot({
          loading: null,
          error,
        });
      },
      onStore: (store) => {
        emitEvent({ kind: "Save parsed", game: "eu5", source: "local" });
        this.updateSnapshot({
          data: store,
          error: null,
          loading: null,
        });
      },
    });
  }

  getSnapshot = (): Eu5SessionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  destroy(): void {
    this.unregisterTerminator();
    this.controller.destroy();
    this.listeners.clear();
  }

  private updateSnapshot(next: Partial<Eu5SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((listener) => listener());
  }
}

let currentSession: Eu5Session | null = null;

export function getEu5Session(save: Eu5SaveInput): Eu5Session {
  if (currentSession && dequal(currentSession.save, save)) {
    return currentSession;
  }

  terminateEu5Session();
  currentSession = new Eu5Session(save);
  return currentSession;
}

export function terminateEu5Session(): void {
  const session = currentSession;
  currentSession = null;
  session?.destroy();
}
