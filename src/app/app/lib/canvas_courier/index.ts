/**
 * Canvas Courier is an input event pipeline for offscreen canvases in web
 * workers.
 *
 * It handles plumbing all canvas-related input events (pointer, keyboard,
 * wheel, focus, resize, and visibility) from the UI thread to the worker.
 * Events are written atomically into a SharedArrayBuffer ring buffer, which
 * bypasses postMessage entirely to avoid serialization overhead and to keep
 * input on a dedicated channel, leaving the worker's message port free for
 * application use. The worker side drains the buffer via
 * `SharedCanvasInputReader`.
 *
 * The ring buffer holds up to 511 events (512 slots, one sacrificed to
 * distinguish full from empty). Events are dropped when the buffer is full.
 *
 * This library is analogous to winit in many aspects.
 *
 * `useCanvasCourierSurface` is a React hook that manages attaching, detaching,
 * and transferring the canvas offscreen in a React Strict Mode-compliant way.
 *
 * Styling contract: the canvas element must have `width: 100%; height: 100%`
 * CSS so that it fills its container. The canvas must also have no padding or
 * border (the Safari fallback reads `contentRect`, which excludes those).
 * Canvas Courier sets `touch-action: none` on attached canvases because these
 * surfaces own touch gestures while attached.
 *
 * Note: SharedArrayBuffer requires cross-origin isolation (COOP/COEP headers).
 *
 * [0]: https://nolanlawson.com/2019/08/14/browsers-input-events-and-frame-throttling/
 */

export { CanvasCourierTransport } from "./dom_transport";
export { WebKeyCode } from "./key_codes.generated";
export {
  SharedCanvasInputReader,
  SharedCanvasEventType,
  SharedCanvasEventAction,
  SharedCanvasPointerKind,
  SharedCanvasWheelDeltaMode,
  type CanvasSize,
  type SharedCanvasInputConfig,
  type SharedCanvasDecodedEvent,
} from "./ring_buffer";
export { useCanvasCourierSurface } from "./useCanvasCourierSurface";
export type { CanvasCourierController, CanvasCourierSurface } from "./types";
