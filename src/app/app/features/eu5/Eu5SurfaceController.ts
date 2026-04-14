import { CanvasCourierTransport } from "@/lib/canvas_courier";
import type { CanvasCourierController, CanvasCourierSurface } from "@/lib/canvas_courier";
import { createLoadedEngine } from "./ui-engine";
import { createEu5Store } from "./store/eu5Store";
import type { Eu5Store } from "./store/eu5Store";
import type { Eu5SaveInput } from "./store/types";
import { captureException } from "@/lib/captureException";
import { isWebGPUSupported } from "@/lib/compatibility";

export class Eu5SurfaceController implements CanvasCourierController {
  private transport: CanvasCourierTransport | null = null;
  private dispose: (() => void) | null = null;
  private loadPromise: Promise<void> | null = null;
  private loadGeneration = 0;

  constructor(
    private readonly save: Eu5SaveInput,
    private readonly callbacks: {
      onProgress?: (increment: number) => void;
      onStore: (store: Eu5Store) => void;
      onError: (error: unknown) => void;
    },
  ) {}

  attachSurface({ canvas, offscreen }: CanvasCourierSurface): void {
    if (!this.transport) {
      this.transport = new CanvasCourierTransport();
    }

    this.transport.attachSurface({ canvas });

    if (this.loadPromise) {
      return;
    }

    if (!isWebGPUSupported()) {
      this.callbacks.onError(new Error("WebGPU is not supported in your browser"));
      return;
    }

    const generation = ++this.loadGeneration;
    this.loadPromise = createLoadedEngine(
      this.save,
      {
        offscreen,
        display: this.transport.currentSize(),
        inputConfig: this.transport.inputConfig,
      },
      this.callbacks.onProgress,
    )
      .then(({ engine, saveDate, playthroughName }) => {
        if (generation !== this.loadGeneration) {
          engine.destroy();
          return;
        }

        this.dispose = () => engine.destroy();
        const filename = this.save.kind === "handle" ? this.save.name : this.save.file.name;
        this.callbacks.onStore(createEu5Store(engine, filename, saveDate, playthroughName));
      })
      .catch((error) => {
        if (generation === this.loadGeneration) {
          this.loadPromise = null;
          this.callbacks.onError(error);
        }
      });
  }

  destroy(): void {
    this.loadGeneration += 1;

    try {
      this.transport?.dispose();
      this.dispose?.();
    } catch (error) {
      captureException(error);
    } finally {
      this.transport = null;
      this.dispose = null;
      this.loadPromise = null;
    }
  }
}
