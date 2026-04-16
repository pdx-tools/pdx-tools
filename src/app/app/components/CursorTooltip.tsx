import { useRef, useEffect } from "react";

export interface CursorPosition {
  x: number;
  y: number;
  active: boolean;
}

interface CursorTooltipProps {
  cursorRef: React.RefObject<CursorPosition>;
  visible: boolean;
  offset?: number;
  children: React.ReactNode;
}

export function CursorTooltip({ cursorRef, visible, offset = 12, children }: CursorTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId: number;

    const update = () => {
      const el = tooltipRef.current;
      const pos = cursorRef.current;

      if (el && pos) {
        const shouldShow = pos.active && visible;

        if (shouldShow) {
          const rect = el.getBoundingClientRect();
          const vw = window.innerWidth;
          const vh = window.innerHeight;

          let x = pos.x + offset;
          let y = pos.y + offset;

          const margin = 4;
          if (x + rect.width > vw - margin) {
            x = pos.x - rect.width - offset;
          }
          if (y + rect.height > vh - margin) {
            y = pos.y - rect.height - offset;
          }

          el.style.transform = `translate(${x}px, ${y}px)`;
          el.style.opacity = "1";
        } else {
          el.style.transform = "translate(0px, 0px)";
          el.style.opacity = "0";
        }
      }

      rafId = requestAnimationFrame(update);
    };

    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [cursorRef, visible, offset]);

  return (
    <div
      ref={tooltipRef}
      className="pointer-events-none fixed top-0 left-0 z-50 opacity-0 transition-opacity duration-75"
    >
      {children}
    </div>
  );
}
