import { describe, expect, it } from "vitest";
import {
  SharedCanvasEventAction,
  SharedCanvasEventType,
  SharedCanvasInputReader,
  SharedCanvasInputWriter,
  SharedCanvasPointerKind,
} from "./ring_buffer";
import type { SharedCanvasDecodedEvent, SharedCanvasInputConfig } from "./ring_buffer";

function createTestConfig(capacity: number): SharedCanvasInputConfig {
  return {
    buffer: new SharedArrayBuffer(64 + capacity * 32),
    capacity,
  };
}

describe("SharedCanvasInputWriter", () => {
  it("preserves FIFO ordering across lifecycle events", () => {
    const config = createTestConfig(8);
    const writer = new SharedCanvasInputWriter(config);
    const reader = new SharedCanvasInputReader(config);
    const drained: SharedCanvasDecodedEvent[] = [];

    writer.enqueueVisibility(true, 1);
    writer.enqueueResize({ width: 320, height: 240, scaleFactor: 2 }, 2);
    writer.enqueueFocus(3);
    writer.enqueueBlur(4);

    reader.drain((event) => {
      drained.push(event);
    });

    expect(drained).toEqual([
      {
        type: SharedCanvasEventType.Visibility,
        action: SharedCanvasEventAction.Hidden,
        timestamp: 1,
      },
      {
        type: SharedCanvasEventType.Resize,
        action: SharedCanvasEventAction.Resize,
        width: 320,
        height: 240,
        scaleFactor: 2,
        timestamp: 2,
      },
      {
        type: SharedCanvasEventType.FocusChange,
        action: SharedCanvasEventAction.Focus,
        timestamp: 3,
      },
      {
        type: SharedCanvasEventType.FocusChange,
        action: SharedCanvasEventAction.Blur,
        timestamp: 4,
      },
    ]);
  });

  it("preserves pointer identity for leave events", () => {
    const config = createTestConfig(8);
    const writer = new SharedCanvasInputWriter(config);
    const reader = new SharedCanvasInputReader(config);
    const drained: SharedCanvasDecodedEvent[] = [];
    const leaveEvent = {
      button: 0,
      ctrlKey: true,
      metaKey: false,
      offsetX: 12,
      offsetY: 34,
      pointerId: 7,
      pointerType: "pen",
      shiftKey: false,
      altKey: false,
      timeStamp: 56,
    } as PointerEvent;

    writer.enqueuePointerLeave(leaveEvent);

    reader.drain((event) => {
      drained.push(event);
    });

    expect(drained).toEqual([
      {
        type: SharedCanvasEventType.Pointer,
        action: SharedCanvasEventAction.Leave,
        modifiers: 2,
        pointerKind: 2,
        pointerId: 7,
        x: 12,
        y: 34,
        button: -1,
        timestamp: 56,
      },
    ]);
  });

  it("preserves touch pointer kind and id", () => {
    const config = createTestConfig(8);
    const writer = new SharedCanvasInputWriter(config);
    const reader = new SharedCanvasInputReader(config);
    const drained: SharedCanvasDecodedEvent[] = [];
    const touchEvent = {
      button: 0,
      ctrlKey: false,
      metaKey: false,
      offsetX: 45,
      offsetY: 67,
      pointerId: 12,
      pointerType: "touch",
      shiftKey: false,
      altKey: false,
      timeStamp: 89,
    } as PointerEvent;

    writer.enqueuePointer(touchEvent, SharedCanvasEventAction.Down);

    reader.drain((event) => {
      drained.push(event);
    });

    expect(drained).toEqual([
      {
        type: SharedCanvasEventType.Pointer,
        action: SharedCanvasEventAction.Down,
        modifiers: 0,
        pointerKind: SharedCanvasPointerKind.Touch,
        pointerId: 12,
        x: 45,
        y: 67,
        button: 0,
        timestamp: 89,
      },
    ]);
  });

  it("drops the newest event when the buffer is full", () => {
    const config = createTestConfig(4);
    const writer = new SharedCanvasInputWriter(config);
    const reader = new SharedCanvasInputReader(config);
    const drained: SharedCanvasDecodedEvent[] = [];

    writer.enqueueVisibility(true, 1);
    writer.enqueueBlur(2);
    writer.enqueueVisibility(false, 3);
    writer.enqueueBlur(4);

    reader.drain((event) => {
      drained.push(event);
    });

    expect(drained).toEqual([
      {
        type: SharedCanvasEventType.Visibility,
        action: SharedCanvasEventAction.Hidden,
        timestamp: 1,
      },
      {
        type: SharedCanvasEventType.FocusChange,
        action: SharedCanvasEventAction.Blur,
        timestamp: 2,
      },
      {
        type: SharedCanvasEventType.Visibility,
        action: SharedCanvasEventAction.Visible,
        timestamp: 3,
      },
    ]);
  });

  it("distinguishes focus from blur events", () => {
    const config = createTestConfig(8);
    const writer = new SharedCanvasInputWriter(config);
    const reader = new SharedCanvasInputReader(config);
    const drained: SharedCanvasDecodedEvent[] = [];

    writer.enqueueFocus(1);
    writer.enqueueBlur(2);

    reader.drain((event) => {
      drained.push(event);
    });

    expect(drained).toEqual([
      {
        type: SharedCanvasEventType.FocusChange,
        action: SharedCanvasEventAction.Focus,
        timestamp: 1,
      },
      {
        type: SharedCanvasEventType.FocusChange,
        action: SharedCanvasEventAction.Blur,
        timestamp: 2,
      },
    ]);
  });
});

describe("SharedCanvasInputReader.waitForEvents", () => {
  it("resolves immediately when events are already queued", async () => {
    const config = createTestConfig(8);
    const writer = new SharedCanvasInputWriter(config);
    const reader = new SharedCanvasInputReader(config);

    writer.enqueueBlur(1);

    await reader.waitForEvents();

    const drained: SharedCanvasDecodedEvent[] = [];
    reader.drain((e) => drained.push(e));
    expect(drained).toHaveLength(1);
  });

  it("resolves when an event is enqueued after waiting begins", async () => {
    const config = createTestConfig(8);
    const writer = new SharedCanvasInputWriter(config);
    const reader = new SharedCanvasInputReader(config);

    const waitPromise = reader.waitForEvents();
    writer.enqueueBlur(1);
    await waitPromise;

    const drained: SharedCanvasDecodedEvent[] = [];
    reader.drain((e) => drained.push(e));
    expect(drained).toHaveLength(1);
  });

  it("resolves immediately when signal is already aborted", async () => {
    const config = createTestConfig(8);
    const reader = new SharedCanvasInputReader(config);
    const controller = new AbortController();
    controller.abort();

    await reader.waitForEvents(controller.signal);
  });

  it("resolves when signal is aborted while waiting", async () => {
    const config = createTestConfig(8);
    const reader = new SharedCanvasInputReader(config);
    const controller = new AbortController();

    const waitPromise = reader.waitForEvents(controller.signal);
    controller.abort();
    await waitPromise;
  });
});
