import { useCallback, useLayoutEffect, useRef } from "react";
import type { CanvasCourierHost } from "./host";

/** Attach a retained canvas for this component and detach it on unmount. */
export function useCanvasCourierSurface(host: CanvasCourierHost | null) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  // Attach the canvas before paint to avoid a blank frame.
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
