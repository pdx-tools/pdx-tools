import { useRef, useEffect } from "react";
import type { CursorPosition } from "@/components/CursorTooltip";

export function useCursorPosition(element: HTMLElement | null): React.RefObject<CursorPosition> {
  const posRef = useRef<CursorPosition>({ x: 0, y: 0, active: false });

  useEffect(() => {
    if (!element) return;

    const onMove = (e: PointerEvent) => {
      posRef.current.x = e.clientX;
      posRef.current.y = e.clientY;
      posRef.current.active = true;
    };

    const onLeave = () => {
      posRef.current.active = false;
    };

    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerleave", onLeave);
    return () => {
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerleave", onLeave);
    };
  }, [element]);

  return posRef;
}
