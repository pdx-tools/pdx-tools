import { encodeWebKeyCode } from "./key_codes.generated";
import type { WebKeyCode } from "./key_codes.generated";

const SHARED_CANVAS_HEADER_BYTES = 64;
const SHARED_CANVAS_SLOT_BYTES = 32;
const SHARED_CANVAS_CAPACITY = 512;
const SHARED_CANVAS_BUFFER_BYTES =
  SHARED_CANVAS_HEADER_BYTES + SHARED_CANVAS_CAPACITY * SHARED_CANVAS_SLOT_BYTES;

const SharedCanvasAtomicIndex = {
  Head: 0,
  Tail: 1,
} as const;

type SharedCanvasAtomicIndex =
  (typeof SharedCanvasAtomicIndex)[keyof typeof SharedCanvasAtomicIndex];

export const SharedCanvasEventType = {
  Pointer: 1,
  Keyboard: 2,
  Wheel: 3,
  FocusChange: 4,
  Resize: 5,
  Visibility: 6,
} as const;

export type SharedCanvasEventType =
  (typeof SharedCanvasEventType)[keyof typeof SharedCanvasEventType];

export const SharedCanvasEventAction = {
  None: 0,
  Down: 1,
  Up: 2,
  Move: 3,
  Leave: 4,
  Focus: 5,
  Blur: 6,
  Scroll: 7,
  Resize: 8,
  Hidden: 9,
  Visible: 10,
} as const;

export type SharedCanvasEventAction =
  (typeof SharedCanvasEventAction)[keyof typeof SharedCanvasEventAction];

const SharedCanvasModifierBits = {
  Shift: 1 << 0,
  Ctrl: 1 << 1,
  Alt: 1 << 2,
  Meta: 1 << 3,
} as const;

type SharedCanvasModifierBits =
  (typeof SharedCanvasModifierBits)[keyof typeof SharedCanvasModifierBits];

export const SharedCanvasPointerKind = {
  Mouse: 1,
  Pen: 2,
  Touch: 3,
} as const;

export type SharedCanvasPointerKind =
  (typeof SharedCanvasPointerKind)[keyof typeof SharedCanvasPointerKind];

export const SharedCanvasWheelDeltaMode = {
  Pixel: 0,
  Line: 1,
  Page: 2,
} as const;

type SharedCanvasWheelDeltaMode =
  (typeof SharedCanvasWheelDeltaMode)[keyof typeof SharedCanvasWheelDeltaMode];

const SharedCanvasSlotOffset = {
  EventType: 0,
  Action: 1,
  Modifiers: 2,
  Metadata: 3,
  Detail: 4,
  DataA: 8,
  DataB: 16,
  Timestamp: 24,
} as const;

type SharedCanvasSlotOffset = (typeof SharedCanvasSlotOffset)[keyof typeof SharedCanvasSlotOffset];

export interface SharedCanvasInputConfig {
  buffer: SharedArrayBuffer;
  capacity: number;
}

interface SharedCanvasKeyboardEvent {
  type: typeof SharedCanvasEventType.Keyboard;
  action: typeof SharedCanvasEventAction.Down | typeof SharedCanvasEventAction.Up;
  modifiers: number;
  repeat: boolean;
  location: number;
  keyCode: WebKeyCode;
  timestamp: number;
}

interface SharedCanvasPointerEvent {
  type: typeof SharedCanvasEventType.Pointer;
  action:
    | typeof SharedCanvasEventAction.Down
    | typeof SharedCanvasEventAction.Up
    | typeof SharedCanvasEventAction.Move
    | typeof SharedCanvasEventAction.Leave;
  modifiers: number;
  pointerKind: SharedCanvasPointerKind;
  pointerId: number;
  /** Position in canvas-local logical pixels. */
  x: number;
  y: number;
  /** -1 when no button is active (move/leave events) */
  button: number;
  timestamp: number;
}

interface SharedCanvasWheelEvent {
  type: typeof SharedCanvasEventType.Wheel;
  action: typeof SharedCanvasEventAction.Scroll;
  modifiers: number;
  deltaMode: SharedCanvasWheelDeltaMode;
  deltaX: number;
  deltaY: number;
  timestamp: number;
}

interface SharedCanvasFocusEvent {
  type: typeof SharedCanvasEventType.FocusChange;
  action: typeof SharedCanvasEventAction.Focus | typeof SharedCanvasEventAction.Blur;
  timestamp: number;
}

interface SharedCanvasResizeEvent {
  type: typeof SharedCanvasEventType.Resize;
  action: typeof SharedCanvasEventAction.Resize;
  /** Physical pixel width. */
  width: number;
  /** Physical pixel height. */
  height: number;
  scaleFactor: number;
  timestamp: number;
}

interface SharedCanvasVisibilityEvent {
  type: typeof SharedCanvasEventType.Visibility;
  action: typeof SharedCanvasEventAction.Hidden | typeof SharedCanvasEventAction.Visible;
  timestamp: number;
}

export type SharedCanvasDecodedEvent =
  | SharedCanvasKeyboardEvent
  | SharedCanvasPointerEvent
  | SharedCanvasWheelEvent
  | SharedCanvasFocusEvent
  | SharedCanvasResizeEvent
  | SharedCanvasVisibilityEvent;

export interface CanvasSize {
  /** Physical pixel width of the canvas (device pixels, not CSS pixels). */
  width: number;
  /** Physical pixel height of the canvas (device pixels, not CSS pixels). */
  height: number;
  scaleFactor: number;
}

// detail field packing: bits[0-15] = button (0xFFFF = no button), bits[16-31] = pointerId
const EMPTY_BUTTON = 0xffff;

export interface SharedCanvasInputQueue {
  config: SharedCanvasInputConfig;
  writer: SharedCanvasInputWriter;
}

export function createSharedCanvasInputQueue(): SharedCanvasInputQueue {
  assertSharedArrayBufferAvailable();

  const buffer = new SharedArrayBuffer(SHARED_CANVAS_BUFFER_BYTES);
  const config: SharedCanvasInputConfig = {
    buffer,
    capacity: SHARED_CANVAS_CAPACITY,
  };

  return {
    config,
    writer: new SharedCanvasInputWriter(config),
  };
}

export function assertSharedArrayBufferAvailable() {
  if (typeof SharedArrayBuffer === "undefined") {
    throw new Error("SharedArrayBuffer is not available in this environment.");
  }

  if (globalThis.crossOriginIsolated !== true) {
    throw new Error(
      "Shared canvas input requires cross-origin isolation (COOP/COEP) before initialization.",
    );
  }
}

export class SharedCanvasInputWriter {
  private readonly controls: Int32Array;
  private readonly float32Scratch = new Float32Array(1);
  private readonly uint32Scratch = new Uint32Array(this.float32Scratch.buffer);
  private readonly view: DataView;
  private droppedEvents = 0;

  constructor(private readonly config: SharedCanvasInputConfig) {
    this.controls = new Int32Array(
      this.config.buffer,
      0,
      SHARED_CANVAS_HEADER_BYTES / Int32Array.BYTES_PER_ELEMENT,
    );
    this.view = new DataView(this.config.buffer);
  }

  enqueueKeyboard(event: KeyboardEvent) {
    const modifiers = encodeModifierBits(event);
    const metadata = (event.location & 0b11) | (event.repeat ? 1 << 2 : 0);
    const keyCode = encodeWebKeyCode(event.code);

    this.enqueue({
      type: SharedCanvasEventType.Keyboard,
      action: event.type === "keydown" ? SharedCanvasEventAction.Down : SharedCanvasEventAction.Up,
      modifiers,
      metadata,
      dataA: keyCode,
      dataB: 0,
      timestamp: event.timeStamp,
      detail: 0,
    });
  }

  enqueuePointer(event: PointerEvent, action: SharedCanvasEventAction) {
    const button =
      action === SharedCanvasEventAction.Move || action === SharedCanvasEventAction.Leave
        ? EMPTY_BUTTON
        : event.button & 0xffff;
    const pointerId = event.pointerId & 0xffff;

    this.enqueue({
      type: SharedCanvasEventType.Pointer,
      action,
      modifiers: encodeModifierBits(event),
      metadata: encodePointerKind(event.pointerType),
      dataA: event.offsetX,
      dataB: event.offsetY,
      timestamp: event.timeStamp,
      detail: button | (pointerId << 16),
    });
  }

  enqueuePointerLeave(event: PointerEvent) {
    this.enqueuePointer(event, SharedCanvasEventAction.Leave);
  }

  enqueueWheel(event: WheelEvent) {
    this.enqueue({
      type: SharedCanvasEventType.Wheel,
      action: SharedCanvasEventAction.Scroll,
      modifiers: encodeModifierBits(event),
      metadata: encodeWheelDeltaMode(event.deltaMode),
      dataA: event.deltaX,
      dataB: event.deltaY,
      timestamp: event.timeStamp,
      detail: 0,
    });
  }

  enqueueBlur(timestamp: number) {
    this.enqueue({
      type: SharedCanvasEventType.FocusChange,
      action: SharedCanvasEventAction.Blur,
      modifiers: 0,
      metadata: 0,
      dataA: 0,
      dataB: 0,
      timestamp,
      detail: 0,
    });
  }

  enqueueFocus(timestamp: number) {
    this.enqueue({
      type: SharedCanvasEventType.FocusChange,
      action: SharedCanvasEventAction.Focus,
      modifiers: 0,
      metadata: 0,
      dataA: 0,
      dataB: 0,
      timestamp,
      detail: 0,
    });
  }

  enqueueResize(size: CanvasSize, timestamp = performance.now()) {
    this.enqueue({
      type: SharedCanvasEventType.Resize,
      action: SharedCanvasEventAction.Resize,
      modifiers: 0,
      metadata: 0,
      dataA: size.width,
      dataB: size.height,
      timestamp,
      detail: this.packFloat32(size.scaleFactor),
    });
  }

  enqueueVisibility(hidden: boolean, timestamp = performance.now()) {
    this.enqueue({
      type: SharedCanvasEventType.Visibility,
      action: hidden ? SharedCanvasEventAction.Hidden : SharedCanvasEventAction.Visible,
      modifiers: 0,
      metadata: 0,
      dataA: 0,
      dataB: 0,
      timestamp,
      detail: 0,
    });
  }

  private enqueue(slot: EncodedSharedCanvasSlot) {
    const head = Atomics.load(this.controls, SharedCanvasAtomicIndex.Head);
    const tail = Atomics.load(this.controls, SharedCanvasAtomicIndex.Tail);
    const nextHead = (head + 1) % this.config.capacity;

    // Drop events if the buffer is full
    if (nextHead === tail) {
      if (this.droppedEvents % 1000 === 0) {
        console.warn(`Canvas courier: buffer full, ${this.droppedEvents + 1} event(s) dropped`);
      }
      this.droppedEvents += 1;
      return;
    }

    this.writeSlot(head, slot);
    Atomics.store(this.controls, SharedCanvasAtomicIndex.Head, nextHead);
    Atomics.notify(this.controls, SharedCanvasAtomicIndex.Head, 1);
  }

  private writeSlot(slotIndex: number, slot: EncodedSharedCanvasSlot) {
    const offset = SHARED_CANVAS_HEADER_BYTES + slotIndex * SHARED_CANVAS_SLOT_BYTES;
    this.view.setUint8(offset + SharedCanvasSlotOffset.EventType, slot.type);
    this.view.setUint8(offset + SharedCanvasSlotOffset.Action, slot.action);
    this.view.setUint8(offset + SharedCanvasSlotOffset.Modifiers, slot.modifiers);
    this.view.setUint8(offset + SharedCanvasSlotOffset.Metadata, slot.metadata);
    this.view.setFloat64(offset + SharedCanvasSlotOffset.DataA, slot.dataA, true);
    this.view.setFloat64(offset + SharedCanvasSlotOffset.DataB, slot.dataB, true);
    this.view.setFloat64(offset + SharedCanvasSlotOffset.Timestamp, slot.timestamp, true);
    this.view.setUint32(offset + SharedCanvasSlotOffset.Detail, slot.detail, true);
  }

  private packFloat32(value: number) {
    this.float32Scratch[0] = value;
    return this.uint32Scratch[0]!;
  }
}

export class SharedCanvasInputReader {
  private readonly controls: Int32Array;
  private readonly float32Scratch = new Float32Array(1);
  private readonly uint32Scratch = new Uint32Array(this.float32Scratch.buffer);
  private readonly view: DataView;

  constructor(private readonly config: SharedCanvasInputConfig) {
    this.controls = new Int32Array(
      this.config.buffer,
      0,
      SHARED_CANVAS_HEADER_BYTES / Int32Array.BYTES_PER_ELEMENT,
    );
    this.view = new DataView(this.config.buffer);
  }

  drain(consume: (event: SharedCanvasDecodedEvent) => void) {
    let tail = Atomics.load(this.controls, SharedCanvasAtomicIndex.Tail);

    while (tail !== Atomics.load(this.controls, SharedCanvasAtomicIndex.Head)) {
      consume(this.decodeSlot(tail));
      tail = (tail + 1) % this.config.capacity;
      Atomics.store(this.controls, SharedCanvasAtomicIndex.Tail, tail);
    }
  }

  async waitForEvents(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return;

    const tail = Atomics.load(this.controls, SharedCanvasAtomicIndex.Tail);
    const head = Atomics.load(this.controls, SharedCanvasAtomicIndex.Head);

    if (head !== tail) {
      return;
    }

    const result = Atomics.waitAsync(this.controls, SharedCanvasAtomicIndex.Head, head);

    if (!result.async) {
      return;
    }

    if (signal) {
      const { promise: abortPromise, resolve } = Promise.withResolvers<void>();
      const listenerAbort = new AbortController();
      signal.addEventListener("abort", () => resolve(), { signal: listenerAbort.signal });
      try {
        await Promise.race([result.value, abortPromise]);
      } finally {
        listenerAbort.abort();
      }
    } else {
      await result.value;
    }
  }

  private decodeSlot(slotIndex: number): SharedCanvasDecodedEvent {
    const offset = SHARED_CANVAS_HEADER_BYTES + slotIndex * SHARED_CANVAS_SLOT_BYTES;
    const type = this.view.getUint8(offset + SharedCanvasSlotOffset.EventType);
    const action = this.view.getUint8(offset + SharedCanvasSlotOffset.Action);
    const modifiers = this.view.getUint8(offset + SharedCanvasSlotOffset.Modifiers);
    const metadata = this.view.getUint8(offset + SharedCanvasSlotOffset.Metadata);
    const dataA = this.view.getFloat64(offset + SharedCanvasSlotOffset.DataA, true);
    const dataB = this.view.getFloat64(offset + SharedCanvasSlotOffset.DataB, true);
    const timestamp = this.view.getFloat64(offset + SharedCanvasSlotOffset.Timestamp, true);
    const detail = this.view.getUint32(offset + SharedCanvasSlotOffset.Detail, true);

    switch (type) {
      case SharedCanvasEventType.Keyboard:
        return {
          type,
          action:
            action === SharedCanvasEventAction.Down
              ? SharedCanvasEventAction.Down
              : SharedCanvasEventAction.Up,
          modifiers,
          repeat: (metadata & (1 << 2)) !== 0,
          location: metadata & 0b11,
          keyCode: dataA as WebKeyCode,
          timestamp,
        };
      case SharedCanvasEventType.Pointer: {
        const button = (detail & 0xffff) === EMPTY_BUTTON ? -1 : detail & 0xffff;
        const pointerId = (detail >>> 16) & 0xffff;
        return {
          type,
          action: action as SharedCanvasPointerEvent["action"],
          modifiers,
          pointerKind: metadata as SharedCanvasPointerKind,
          pointerId,
          x: dataA,
          y: dataB,
          button,
          timestamp,
        };
      }
      case SharedCanvasEventType.Wheel:
        return {
          type,
          action: SharedCanvasEventAction.Scroll,
          modifiers,
          deltaMode: metadata as SharedCanvasWheelDeltaMode,
          deltaX: dataA,
          deltaY: dataB,
          timestamp,
        };
      case SharedCanvasEventType.FocusChange:
        return {
          type,
          action:
            action === SharedCanvasEventAction.Focus
              ? SharedCanvasEventAction.Focus
              : SharedCanvasEventAction.Blur,
          timestamp,
        };
      case SharedCanvasEventType.Resize:
        return {
          type,
          action: SharedCanvasEventAction.Resize,
          width: dataA,
          height: dataB,
          scaleFactor: this.unpackFloat32(detail),
          timestamp,
        };
      case SharedCanvasEventType.Visibility:
        return {
          type,
          action:
            action === SharedCanvasEventAction.Hidden
              ? SharedCanvasEventAction.Hidden
              : SharedCanvasEventAction.Visible,
          timestamp,
        };
      default:
        throw new Error(`Unexpected shared canvas event type ${type}.`);
    }
  }

  private unpackFloat32(value: number) {
    this.uint32Scratch[0] = value >>> 0;
    return this.float32Scratch[0]!;
  }
}

interface EncodedSharedCanvasSlot {
  type: SharedCanvasEventType;
  action: SharedCanvasEventAction;
  modifiers: number;
  metadata: number;
  dataA: number;
  dataB: number;
  timestamp: number;
  detail: number;
}

function encodeModifierBits(
  event: Pick<KeyboardEvent | MouseEvent, "shiftKey" | "ctrlKey" | "altKey" | "metaKey">,
) {
  let modifiers = 0;
  if (event.shiftKey) modifiers |= SharedCanvasModifierBits.Shift;
  if (event.ctrlKey) modifiers |= SharedCanvasModifierBits.Ctrl;
  if (event.altKey) modifiers |= SharedCanvasModifierBits.Alt;
  if (event.metaKey) modifiers |= SharedCanvasModifierBits.Meta;
  return modifiers;
}

function encodePointerKind(pointerType: string) {
  switch (pointerType) {
    case "mouse":
      return SharedCanvasPointerKind.Mouse;
    case "pen":
      return SharedCanvasPointerKind.Pen;
    case "touch":
      return SharedCanvasPointerKind.Touch;
    default:
      return SharedCanvasPointerKind.Mouse;
  }
}

function encodeWheelDeltaMode(deltaMode: number) {
  switch (deltaMode) {
    case WheelEvent.DOM_DELTA_LINE:
      return SharedCanvasWheelDeltaMode.Line;
    case WheelEvent.DOM_DELTA_PAGE:
      return SharedCanvasWheelDeltaMode.Page;
    default:
      return SharedCanvasWheelDeltaMode.Pixel;
  }
}
