import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasCourierHost } from "./host";
import type { CanvasCourierTransport } from "./dom_transport";
import {
  SharedCanvasEventAction,
  SharedCanvasEventType,
  SharedCanvasInputReader,
} from "./ring_buffer";
import type { SharedCanvasDecodedEvent } from "./ring_buffer";

class TestContainer {
  child: TestCanvas | null = null;

  appendChild(canvas: TestCanvas) {
    canvas.remove();
    this.child = canvas;
    canvas.parentElement = this;
  }
}

class TestCanvas extends EventTarget {
  className = "";
  tabIndex = -1;
  width = 300;
  height = 150;
  style = { cursor: "", touchAction: "" };
  parentElement: TestContainer | null = null;
  transferControlToOffscreen = vi.fn(() => ({ width: 300, height: 150 }));

  getBoundingClientRect() {
    return { width: 480, height: 320 };
  }

  focus() {
    testDocument.activeElement = this;
    this.dispatchEvent(new Event("focus"));
  }

  remove() {
    if (this.parentElement) this.parentElement.child = null;
    this.parentElement = null;
    if (testDocument.activeElement === this) {
      testDocument.activeElement = null;
      this.dispatchEvent(new Event("blur"));
    }
  }

  replaceWith(canvas: TestCanvas) {
    const parent = this.parentElement;
    this.remove();
    parent?.appendChild(canvas);
  }
}

class TestDocument extends EventTarget {
  activeElement: TestCanvas | null = null;
  hidden = false;
  createElement = vi.fn(() => new TestCanvas());
}

class TestResizeObserver {
  static latest: TestResizeObserver;
  observe = vi.fn();
  disconnect = vi.fn();

  constructor(private readonly callback: (entries: ResizeObserverEntry[]) => void) {
    TestResizeObserver.latest = this;
  }

  resize(width: number, height: number) {
    this.callback([{ contentRect: { width, height } } as ResizeObserverEntry]);
  }
}

let testDocument: TestDocument;

function containerElement(container: TestContainer): HTMLElement {
  return container as unknown as HTMLElement;
}

function drain(reader: SharedCanvasInputReader): SharedCanvasDecodedEvent[] {
  const events: SharedCanvasDecodedEvent[] = [];
  reader.drain((event) => events.push(event));
  return events;
}

beforeEach(() => {
  testDocument = new TestDocument();
  vi.stubGlobal("crossOriginIsolated", true);
  vi.stubGlobal("document", testDocument);
  vi.stubGlobal("window", {
    devicePixelRatio: 2,
    matchMedia: () => new EventTarget(),
  });
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
});

afterEach(() => vi.unstubAllGlobals());

describe("CanvasCourierHost", () => {
  it("constructs without browser globals", () => {
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("window", undefined);
    const host = new CanvasCourierHost("board", vi.fn());
    expect(host.canvas).toBeNull();
    host.dispose();
  });

  it("keeps one transfer across effect cleanup and a move to another container", () => {
    const onSurface = vi.fn();
    const host = new CanvasCourierHost("board", onSurface);
    const first = new TestContainer();
    const second = new TestContainer();
    host.attach(containerElement(first));
    const canvas = first.child!;
    const config = onSurface.mock.calls[0]![1].inputConfig;

    host.detach(containerElement(first));
    host.attach(containerElement(first));
    host.attach(containerElement(second));
    host.detach(containerElement(first));

    expect(first.child).toBeNull();
    expect(second.child).toBe(canvas);
    expect(canvas.transferControlToOffscreen).toHaveBeenCalledOnce();
    expect(onSurface).toHaveBeenCalledOnce();
    expect(onSurface.mock.calls[0]![1].inputConfig).toBe(config);
    host.dispose();
    expect(second.child).toBeNull();
  });

  it("clears input and pauses on detach, then resumes with the same queue and size", () => {
    let transport!: CanvasCourierTransport;
    const host = new CanvasCourierHost("board", (_, next) => {
      transport = next;
    });
    const container = new TestContainer();
    host.attach(containerElement(container));
    const canvas = container.child!;
    const observer = TestResizeObserver.latest;
    const reader = new SharedCanvasInputReader(transport.inputConfig);
    canvas.focus();
    drain(reader);

    host.detach(containerElement(container));
    expect(drain(reader).map((event) => [event.type, event.action])).toEqual([
      [SharedCanvasEventType.FocusChange, SharedCanvasEventAction.Blur],
      [SharedCanvasEventType.Visibility, SharedCanvasEventAction.Hidden],
    ]);
    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(transport.currentSize()).toEqual({ width: 960, height: 640, scaleFactor: 2 });
    canvas.dispatchEvent(new Event("focus"));
    testDocument.dispatchEvent(new Event("visibilitychange"));
    host.detach(containerElement(container));
    expect(drain(reader)).toEqual([]);

    host.attach(containerElement(container));
    const events = drain(reader);
    expect(events.map((event) => event.type)).toEqual([
      SharedCanvasEventType.Resize,
      SharedCanvasEventType.FocusChange,
      SharedCanvasEventType.Visibility,
    ]);
    expect(events[2]!.action).toBe(SharedCanvasEventAction.Visible);
    host.dispose();
  });

  it("keeps the last size when the observer reports an empty canvas", () => {
    let transport!: CanvasCourierTransport;
    const host = new CanvasCourierHost("board", (_, next) => {
      transport = next;
    });
    host.attach(containerElement(new TestContainer()));
    const reader = new SharedCanvasInputReader(transport.inputConfig);
    drain(reader);
    TestResizeObserver.latest.resize(0, 0);
    TestResizeObserver.latest.resize(480, 0);
    expect(drain(reader)).toEqual([]);
    expect(transport.currentSize()).toEqual({ width: 960, height: 640, scaleFactor: 2 });

    TestResizeObserver.latest.resize(640, 480);
    expect(drain(reader)).toMatchObject([
      { type: SharedCanvasEventType.Resize, width: 1280, height: 960 },
    ]);
    host.dispose();
  });

  it("renews with the same classes, cursor, focus, and a new queue", () => {
    const onSurface = vi.fn();
    const host = new CanvasCourierHost("board", onSurface);
    const container = new TestContainer();
    host.setCursor("crosshair");
    host.attach(containerElement(container));
    const previous = container.child!;
    const previousConfig = onSurface.mock.calls[0]![1].inputConfig;
    previous.focus();
    expect(previous.className).toBe("board");
    expect(previous.transferControlToOffscreen).toHaveBeenCalledOnce();

    host.renew();
    expect(container.child).not.toBe(previous);
    expect(container.child!.className).toBe("board");
    expect(container.child!.style.cursor).toBe("crosshair");
    expect(testDocument.activeElement).toBe(container.child);
    expect(onSurface).toHaveBeenCalledTimes(2);
    const transport = onSurface.mock.calls[1]![1] as CanvasCourierTransport;
    expect(transport.inputConfig).not.toBe(previousConfig);
    expect(drain(new SharedCanvasInputReader(transport.inputConfig))).toMatchObject([
      { type: SharedCanvasEventType.Resize },
      { type: SharedCanvasEventType.FocusChange, action: SharedCanvasEventAction.Focus },
      { type: SharedCanvasEventType.Visibility, action: SharedCanvasEventAction.Visible },
    ]);
    host.dispose();
  });
});
