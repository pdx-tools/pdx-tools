import { useCallback, useLayoutEffect, useRef } from "react";
import type { CanvasCourierHost } from "./host";

/**
 * Show the canvas of a host in a container. When the component unmounts,
 * the canvas leaves the container and the host stays. Thus the next
 * component that shows the canvas continues where this one stopped.
 */
export function useCanvasCourierSurface(host: CanvasCourierHost | null) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  // A layout effect, so that a canvas that moves from another container
  // is in place before the first paint.
  useLayoutEffect(() => {
    const container = surfaceRef.current;
    if (!container || !host) {
      return;
    }

    host.attach(container);
    return () => host.detach(container);
  }, [host]);

  const focus = useCallback(() => {
    host?.canvas?.focus({ preventScroll: true });
  }, [host]);

  return { surfaceRef, focus };
}
