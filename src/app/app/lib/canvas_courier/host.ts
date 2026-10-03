import { CanvasCourierTransport } from "./dom_transport";
import type { CanvasCourierSurface } from "./types";

/**
 * A canvas that outlives the components that show it.
 *
 * The host makes the canvas and gives its offscreen to a worker once. The
 * canvas can then move from one container to the next, such as from one
 * route to another, and the worker keeps the surface, the GPU device, and
 * what it drew.
 */
export class CanvasCourierHost {
  private element: HTMLCanvasElement | null = null;
  private container: HTMLElement | null = null;
  private transport = new CanvasCourierTransport();
  private cursor = "";

  /**
   * @param className The classes of the canvas. It must fill its container
   * (see the styling contract of Canvas Courier).
   * @param onSurface Receives the offscreen of each new canvas, while the
   * canvas is in the document, so that its size is known.
   */
  constructor(
    private readonly className: string,
    private readonly onSurface: (
      surface: CanvasCourierSurface,
      transport: CanvasCourierTransport,
    ) => void,
  ) {}

  /** The canvas, once a container shows it. */
  get canvas(): HTMLCanvasElement | null {
    return this.element;
  }

  /** Set the cursor over the canvas. A new canvas gets it too. */
  setCursor(cursor: string): void {
    this.cursor = cursor;
    if (this.element !== null) {
      this.element.style.cursor = cursor;
    }
  }

  /** Show the canvas in the container. */
  attach(container: HTMLElement): void {
    this.container = container;
    if (this.element === null) {
      this.createSurface(container);
      return;
    }

    container.appendChild(this.element);
    this.transport.attachSurface({ canvas: this.element });
  }

  /** Take the canvas out of the container, if the container still shows it. */
  detach(container: HTMLElement): void {
    if (this.container !== container) {
      return;
    }

    this.container = null;
    this.transport.detachSurface();
    this.element?.remove();
  }

  /**
   * Put a new canvas in place of the current one, for a new worker. An
   * offscreen canvas cannot go back to the document, so a worker that
   * stops takes its canvas with it.
   */
  renew(): void {
    const previous = this.element;
    this.element = null;
    this.transport.dispose();
    this.transport = new CanvasCourierTransport();

    const container = this.container;
    if (container !== null) {
      this.createSurface(container, previous);
    } else {
      previous?.remove();
    }
  }

  dispose(): void {
    this.transport.dispose();
    this.element?.remove();
    this.element = null;
    this.container = null;
  }

  private createSurface(container: HTMLElement, replaces: HTMLCanvasElement | null = null): void {
    const canvas = document.createElement("canvas");
    canvas.className = this.className;
    canvas.tabIndex = 0;
    canvas.style.cursor = this.cursor;
    // The new canvas takes the focus of the one it replaces, so that the
    // keyboard still steers the map.
    const hadFocus = replaces !== null && replaces === document.activeElement;
    if (replaces !== null && replaces.parentElement === container) {
      replaces.replaceWith(canvas);
    } else {
      replaces?.remove();
      container.appendChild(canvas);
    }
    if (hadFocus) {
      canvas.focus({ preventScroll: true });
    }

    this.element = canvas;
    const offscreen = canvas.transferControlToOffscreen();
    this.transport.attachSurface({ canvas });
    this.onSurface({ canvas, offscreen }, this.transport);
  }
}
