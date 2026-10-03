import { useCallback, useLayoutEffect, useRef } from "react";
import type { CanvasCourierHost } from "./host";

/**
 * Show the canvas of a host in a container. The canvas leaves the
 * container when the component unmounts and the host stays, so that the
 * next component to show it continues where this one stopped.
 */
export function useCanvasCourierSurface(host: CanvasCourierHost) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  // A layout effect, so that a canvas that moves from another container
  // is in place before the first paint.
  useLayoutEffect(() => {
    const container = surfaceRef.current;
    if (!container) {
      return;
    }

    host.attach(container);
    return () => host.detach(container);
  }, [host]);

  const focus = useCallback(() => {
    host.canvas?.focus({ preventScroll: true });
  }, [host]);

  return { surfaceRef, focus };
}
