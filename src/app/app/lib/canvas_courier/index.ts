/**
 * Send canvas input to a worker through a shared event queue.
 * Retain the worker surface while page owners change.
 *
 * The canvas must fill its container, with no padding or border.
 * Attached canvases own touch gestures. Shared memory requires cross origin isolation.
 */

export { CanvasCourierTransport } from "./dom_transport";
export { WebKeyCode } from "./key_codes.generated";
export {
  SharedCanvasInputReader,
  SharedCanvasEventType,
  SharedCanvasEventAction,
  SharedCanvasPointerKind,
  SharedCanvasWheelDeltaMode,
  SharedCanvasModifierBits,
  type CanvasSize,
  type SharedCanvasInputConfig,
  type SharedCanvasDecodedEvent,
  type SharedCanvasModifierBits as SharedCanvasModifierBitsType,
} from "./ring_buffer";
export { CanvasCourierHost } from "./host";
export { useCanvasCourierSurface } from "./useCanvasCourierSurface";
export type { CanvasCourierSurface } from "./types";
