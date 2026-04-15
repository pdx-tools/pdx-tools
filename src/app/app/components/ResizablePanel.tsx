import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cx } from "class-variance-authority";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { ArrowsPointingInIcon, ArrowsPointingOutIcon } from "@heroicons/react/24/solid";

interface ResizablePanelProps {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  collapseThreshold?: number;
  header?: ReactNode;
  children: ReactNode;
}

const RESIZE_STEP = 16;

export function ResizablePanel({
  open,
  onClose,
  side,
  defaultWidth = 352,
  minWidth = 256,
  maxWidth = 640,
  collapseThreshold = 224,
  header,
  children,
}: ResizablePanelProps) {
  const [width, setWidth] = useState(defaultWidth);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const previousWidthRef = useRef(width);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleDragStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsDragging(true);
      startXRef.current = e.clientX;
      startWidthRef.current = width;
    },
    [width],
  );

  const handleDragMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      const delta =
        side === "right" ? startXRef.current - e.clientX : e.clientX - startXRef.current;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidthRef.current + delta));
      setWidth(newWidth);
    },
    [isDragging, side, minWidth, maxWidth],
  );

  const handleDragEnd = useCallback(
    (e: React.PointerEvent) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      setIsDragging(false);
      if (width < collapseThreshold) {
        setWidth(defaultWidth);
        onClose();
      }
    },
    [width, collapseThreshold, defaultWidth, onClose],
  );

  const handleKeyResize = useCallback(
    (e: React.KeyboardEvent) => {
      let newWidth = width;
      if (side === "right") {
        if (e.key === "ArrowLeft") newWidth = Math.min(maxWidth, width + RESIZE_STEP);
        if (e.key === "ArrowRight") newWidth = Math.max(minWidth, width - RESIZE_STEP);
      } else {
        if (e.key === "ArrowRight") newWidth = Math.min(maxWidth, width + RESIZE_STEP);
        if (e.key === "ArrowLeft") newWidth = Math.max(minWidth, width - RESIZE_STEP);
      }
      if (newWidth !== width) {
        e.preventDefault();
        setWidth(newWidth);
      }
    },
    [width, side, minWidth, maxWidth],
  );

  return (
    <div
      style={isMaximized ? undefined : { width: `${width}px` }}
      className={cx(
        "pointer-events-auto absolute inset-y-0 z-30 flex flex-col",
        "border-white/10 bg-slate-950/75 shadow-xl backdrop-blur",
        side === "right" ? "right-0 border-l" : "left-0 border-r",
        isMaximized && "w-screen!",
        !isDragging && "transition-transform duration-300 ease-out",
        !open && side === "right" && "translate-x-full",
        !open && side === "left" && "-translate-x-full",
        isDragging && "select-none",
      )}
    >
      {/* Drag handle — on the panel's leading edge */}
      {!isMaximized && (
        <div
          role="separator"
          aria-orientation="vertical"
          tabIndex={0}
          className={cx(
            "absolute inset-y-0 z-10 w-1.5 cursor-col-resize",
            "transition-colors duration-100",
            "hover:bg-sky-400/30 active:bg-sky-400/50",
            "focus-visible:bg-sky-400/30 focus-visible:outline-none",
            side === "right" ? "left-0" : "right-0",
          )}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          onKeyDown={handleKeyResize}
        >
          {/* Grip indicator */}
          <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-0.5">
            <div className="h-5 w-0.5 rounded-full bg-slate-500" />
            <div className="h-5 w-0.5 rounded-full bg-slate-500" />
          </div>
        </div>
      )}

      {/* Header bar */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:outline-none"
          aria-label="Close panel"
        >
          {side === "right" ? (
            <ChevronRightIcon className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeftIcon className="h-3.5 w-3.5" />
          )}
        </button>

        <div className="min-w-0 flex-1">{header}</div>

        <button
          type="button"
          onClick={() => {
            if (isMaximized) {
              setWidth(previousWidthRef.current);
            } else {
              previousWidthRef.current = width;
            }
            setIsMaximized((m) => !m);
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:outline-none"
          aria-label={isMaximized ? "Restore panel size" : "Maximize panel"}
        >
          {isMaximized ? (
            <ArrowsPointingInIcon className="h-3.5 w-3.5" />
          ) : (
            <ArrowsPointingOutIcon className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Content area */}
      <div
        className={cx(
          "flex-1 overflow-y-auto",
          isDragging && width < collapseThreshold && "opacity-50",
        )}
      >
        {children}
      </div>
    </div>
  );
}
