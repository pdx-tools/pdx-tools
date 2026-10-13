import { CanvasCourierTransport } from "./dom_transport";
import type { CanvasCourierSurface } from "./types";

/** Retain one worker surface while the canvas moves between page owners. */
export class CanvasCourierHost {
  private element: HTMLCanvasElement | null = null;
  private container: HTMLElement | null = null;
  private transport = new CanvasCourierTransport();
  private cursor = "";

  /**
   * @param className Classes that make the canvas fill its container.
   * @param onSurface Receive each new worker surface after attachment.
   */
  constructor(
    private readonly className: string,
    private readonly onSurface: (
      surface: CanvasCourierSurface,
      transport: CanvasCourierTransport,
    ) => void,
  ) {}

  get canvas(): HTMLCanvasElement | null {
    return this.element;
  }

  setCursor(cursor: string): void {
    this.cursor = cursor;
    if (this.element !== null) {
      this.element.style.cursor = cursor;
    }
  }

  attach(container: HTMLElement): void {
    this.container = container;
    if (this.element === null) {
      this.createSurface(container);
      return;
    }

    container.appendChild(this.element);
    this.transport.attachSurface({ canvas: this.element });
  }

  detach(container: HTMLElement): void {
    if (this.container !== container) {
      return;
    }

    this.container = null;
    this.transport.detachSurface();
    this.element?.remove();
  }

  /** Replace the canvas when its worker ends; an offscreen transfer cannot be reversed. */
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
    // Preserve keyboard focus across canvas replacement.
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
