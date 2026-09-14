import { useRef, useEffect } from "react";
import type { CursorPosition } from "@/components/CursorTooltip";

export function useCursorPosition(
  element: HTMLElement | React.RefObject<HTMLElement | null> | null,
): React.RefObject<CursorPosition> {
  const posRef = useRef<CursorPosition>({ x: 0, y: 0, active: false });

  useEffect(() => {
    const target = element && "current" in element ? element.current : element;
    if (!target) return;

    const onMove = (e: PointerEvent) => {
      posRef.current.x = e.clientX;
      posRef.current.y = e.clientY;
      posRef.current.active = true;
    };

    const onLeave = () => {
      posRef.current.active = false;
    };

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerleave", onLeave);
    return () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerleave", onLeave);
    };
  }, [element]);

  return posRef;
}
