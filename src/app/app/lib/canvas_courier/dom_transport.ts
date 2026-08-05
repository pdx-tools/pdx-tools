import type { CanvasCourierDomSurface } from "./types";
import { SharedCanvasEventAction, createSharedCanvasInputQueue } from "./ring_buffer";
import type { CanvasSize, SharedCanvasInputConfig, SharedCanvasInputQueue } from "./ring_buffer";

// Cached feature detection - Safari does not support devicePixelContentBoxSize.
// See https://bugs.webkit.org/show_bug.cgi?id=219005
const SUPPORTS_DEVICE_PIXEL_CONTENT_BOX =
  typeof ResizeObserverEntry !== "undefined" &&
  "devicePixelContentBoxSize" in ResizeObserverEntry.prototype;

export function canvasPhysicalSize(
  cssWidth: number,
  cssHeight: number,
  scaleFactor: number,
  reportedDevicePixels?: { inlineSize: number; blockSize: number },
): CanvasSize {
  const expectedWidth = Math.floor(cssWidth * scaleFactor);
  const expectedHeight = Math.floor(cssHeight * scaleFactor);
  const reportedIsPlausible =
    reportedDevicePixels !== undefined &&
    Math.abs(reportedDevicePixels.inlineSize - expectedWidth) <= 1 &&
    Math.abs(reportedDevicePixels.blockSize - expectedHeight) <= 1;

  return {
    width: reportedIsPlausible ? reportedDevicePixels.inlineSize : expectedWidth,
    height: reportedIsPlausible ? reportedDevicePixels.blockSize : expectedHeight,
    scaleFactor,
  };
}

export class CanvasCourierTransport {
  private activeSurface: CanvasCourierDomSurface | undefined;
  private attachmentAbortController: AbortController | undefined;
  private canvasSize: CanvasSize | undefined;
  // Lazily initialized on first attachSurface so that constructing a
  // CanvasCourierTransport is safe during server-side rendering.
  private _inputQueue: SharedCanvasInputQueue | undefined;
  private resizeObserver: ResizeObserver | undefined;

  private get inputQueue(): SharedCanvasInputQueue {
    this._inputQueue ??= createSharedCanvasInputQueue();
    return this._inputQueue;
  }

  get inputConfig(): SharedCanvasInputConfig {
    return this.inputQueue.config;
  }

  currentSize(): CanvasSize {
    if (!this.canvasSize) {
      throw new Error("Canvas Courier transport size is not initialized yet.");
    }

    return this.canvasSize;
  }

  measureSurface(surface: CanvasCourierDomSurface): CanvasSize {
    const bounds = surface.canvas.getBoundingClientRect();
    const scaleFactor = window.devicePixelRatio;
    const width = bounds.width || surface.canvas.width;
    const height = bounds.height || surface.canvas.height;
    return {
      width: Math.floor(width * scaleFactor),
      height: Math.floor(height * scaleFactor),
      scaleFactor,
    };
  }

  attachSurface(surface: CanvasCourierDomSurface): void {
    this.releaseSurfaceBindings();
    this.activeSurface = surface;

    const abortController = new AbortController();
    const listenerOptions = { signal: abortController.signal } as const;

    this.attachmentAbortController = abortController;
    this.syncSurfaceSize(surface);
    surface.canvas.style.touchAction = "none";

    surface.canvas.addEventListener(
      "keydown",
      (event) => {
        this.inputQueue.writer.enqueueKeyboard(event);
      },
      listenerOptions,
    );

    surface.canvas.addEventListener(
      "keyup",
      (event) => {
        this.inputQueue.writer.enqueueKeyboard(event);
      },
      listenerOptions,
    );

    surface.canvas.addEventListener(
      "focus",
      () => {
        this.inputQueue.writer.enqueueFocus(performance.now());
      },
      listenerOptions,
    );

    surface.canvas.addEventListener(
      "blur",
      () => {
        this.inputQueue.writer.enqueueBlur(performance.now());
      },
      listenerOptions,
    );

    document.addEventListener(
      "visibilitychange",
      () => {
        this.inputQueue.writer.enqueueVisibility(document.hidden);
      },
      listenerOptions,
    );

    surface.canvas.addEventListener(
      "pointermove",
      (event) => {
        const coalesced = event.getCoalescedEvents();
        if (coalesced.length === 0) {
          this.inputQueue.writer.enqueuePointer(event, SharedCanvasEventAction.Move);
        } else {
          for (const e of coalesced) {
            this.inputQueue.writer.enqueuePointer(e, SharedCanvasEventAction.Move);
          }
        }
      },
      listenerOptions,
    );

    surface.canvas.addEventListener(
      "pointerdown",
      (event) => {
        surface.canvas.focus({ preventScroll: true });
        surface.canvas.setPointerCapture(event.pointerId);
        this.inputQueue.writer.enqueuePointer(event, SharedCanvasEventAction.Down);
      },
      listenerOptions,
    );

    surface.canvas.addEventListener(
      "pointerup",
      (event) => {
        this.inputQueue.writer.enqueuePointer(event, SharedCanvasEventAction.Up);
      },
      listenerOptions,
    );

    surface.canvas.addEventListener(
      "pointerleave",
      (event) => {
        this.inputQueue.writer.enqueuePointerLeave(event);
      },
      listenerOptions,
    );

    surface.canvas.addEventListener(
      "pointercancel",
      (event) => {
        this.inputQueue.writer.enqueuePointerLeave(event);
      },
      listenerOptions,
    );

    surface.canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        this.inputQueue.writer.enqueueWheel(event);
      },
      { signal: abortController.signal, passive: false },
    );

    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      const scaleFactor = window.devicePixelRatio;
      const rect = entry.contentRect;
      const devicePixels = SUPPORTS_DEVICE_PIXEL_CONTENT_BOX
        ? entry.devicePixelContentBoxSize[0]
        : undefined;
      const nextSize = canvasPhysicalSize(rect.width, rect.height, scaleFactor, devicePixels);

      this.canvasSize = nextSize;
      this.inputQueue.writer.enqueueResize(nextSize);
    });

    if (SUPPORTS_DEVICE_PIXEL_CONTENT_BOX) {
      this.resizeObserver.observe(surface.canvas, { box: "device-pixel-content-box" });
    } else {
      this.resizeObserver.observe(surface.canvas);
      this.observeDevicePixelRatio(surface);
    }

    this.inputQueue.writer.enqueueVisibility(document.hidden);
  }

  dispose(): void {
    this.activeSurface = undefined;
    this.canvasSize = undefined;
    this._inputQueue = undefined;
    this.releaseSurfaceBindings();
  }

  private syncSurfaceSize(surface: CanvasCourierDomSurface): void {
    const nextSize = this.measureSurface(surface);
    this.canvasSize = nextSize;
    this.inputQueue.writer.enqueueResize(nextSize);
  }

  private releaseSurfaceBindings(): void {
    this.attachmentAbortController?.abort();
    this.attachmentAbortController = undefined;
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
  }

  // Safari doesn't support devicePixelContentBoxSize, so DPR changes don't fire
  // the ResizeObserver. We use a matchMedia query to detect DPR changes instead.
  private observeDevicePixelRatio(surface: CanvasCourierDomSurface): void {
    const mediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mediaQuery.addEventListener(
      "change",
      () => {
        if (this.activeSurface?.canvas !== surface.canvas) {
          return;
        }

        this.syncSurfaceSize(surface);
        this.observeDevicePixelRatio(surface);
      },
      { once: true, signal: this.attachmentAbortController?.signal },
    );
  }
}
