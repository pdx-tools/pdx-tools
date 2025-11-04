import type { RefObject } from "react";
import { useCanvasEvents } from "./useCanvasEvents";
import { useEu5Engine } from "./store";

interface CanvasEventHandlerProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

/**
 * Component that sets up canvas event listeners for the EU5 map.
 * Must be rendered inside Eu5StoreProvider to access the engine.
 */
export function CanvasEventHandler({ canvasRef }: CanvasEventHandlerProps) {
  const engine = useEu5Engine();
  useCanvasEvents(canvasRef, engine);
  return null;
}
