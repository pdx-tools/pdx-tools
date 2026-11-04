import type React from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { cx } from "class-variance-authority";
import { focusRingInset } from "@/components/game/focusRing";
import { usePanelNav } from "../features/profiles/PanelNavContext";
import { SHEET_LABELS, cycleSnap, settleSnap, sheetHeight, stepSnap } from "./sheet";
import type { SheetSnap } from "./sheet";

/** A pointer that moves less than this, in px, is a tap */
const TAP_SLOP = 6;

function placeSheet(sheet: HTMLElement, height: number) {
  sheet.style.setProperty("--sheet-height", `${height}px`);
}

type Drag = {
  startY: number;
  startHeight: number;
  lastY: number;
  lastTime: number;
  speed: number;
  moved: boolean;
};

/**
 * The top row of the sheet on a phone: the handle in a zone of 24px, then the
 * save's name and date at the start and the actions on the save at the end. The
 * grabber is the full row behind the text, and the actions are on top of it, under
 * that zone. A drag resizes the sheet and it stops on one of three sizes. A tap goes to the next size, and the
 * arrow keys go up and down, so the sizes do not need a drag.
 *
 * A drag writes the height on the sheet's element, so the levels do not render
 * again on each move.
 */
export function SheetGrabber() {
  // The sheet is the column around this row. A ref from the column is not set
  // yet when the first layout effect of this row runs.
  const row = useRef<HTMLDivElement>(null);
  const sheet = () => row.current?.closest("aside") ?? null;
  const [snap, setSnap] = useState<SheetSnap>("half");
  const drag = useRef<Drag | null>(null);
  const dragged = useRef(false);
  // Compare needs the height for its rows and the map does not help it, so the
  // sheet goes to its top size. Back returns the size of before, if the reader
  // did not choose another one in the level.
  const comparing = usePanelNav().top?.kind === "compare";
  const [wasComparing, setWasComparing] = useState(comparing);
  const [beforeCompare, setBeforeCompare] = useState<SheetSnap>(snap);
  if (comparing !== wasComparing) {
    setWasComparing(comparing);
    if (comparing) {
      setBeforeCompare(snap);
      setSnap("sheet");
    } else if (snap === "sheet") {
      setSnap(beforeCompare);
    }
  }

  useLayoutEffect(() => {
    const aside = row.current?.closest("aside");
    const frame = aside?.offsetParent;
    if (!aside || !frame) return;
    const rest = () => {
      if (drag.current) return;
      placeSheet(aside, sheetHeight(snap, frame.clientHeight));
    };
    rest();
    const observer = new ResizeObserver(rest);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [snap]);

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragged.current = false;
    drag.current = {
      startY: event.clientY,
      startHeight: sheet()?.getBoundingClientRect().height ?? 0,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      speed: 0,
      moved: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    const aside = sheet();
    const frame = aside?.offsetParent?.clientHeight;
    if (!state || !aside || frame === undefined) return;
    if (!state.moved && Math.abs(event.clientY - state.startY) < TAP_SLOP) return;
    if (!state.moved) aside.style.transition = "none";
    state.moved = true;
    const height = state.startHeight + state.startY - event.clientY;
    placeSheet(
      aside,
      Math.max(sheetHeight("map", frame), Math.min(sheetHeight("sheet", frame), height)),
    );
    const elapsed = event.timeStamp - state.lastTime;
    if (elapsed > 0) state.speed = (state.lastY - event.clientY) / elapsed;
    state.lastY = event.clientY;
    state.lastTime = event.timeStamp;
  };

  const onPointerEnd = () => {
    const state = drag.current;
    drag.current = null;
    const aside = sheet();
    const frame = aside?.offsetParent?.clientHeight;
    if (!state?.moved || !aside || frame === undefined) return;
    dragged.current = true;
    const next = settleSnap(aside.getBoundingClientRect().height, state.speed, frame);
    aside.style.transition = "";
    // The size can be the same as before, so state alone would not move the sheet.
    placeSheet(aside, sheetHeight(next, frame));
    setSnap(next);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    setSnap(stepSnap(snap, event.key === "ArrowUp" ? 1 : -1));
  };

  return (
    <div ref={row} className="relative h-6 shrink-0">
      <button
        type="button"
        aria-label={`Sheet size: ${SHEET_LABELS[snap]}. Press for the next size, or use the up and down arrow keys.`}
        title="Drag to resize the sheet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
        onClick={() => {
          // The release of a drag also sends a click.
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          setSnap(cycleSnap(snap));
        }}
        className={cx(
          "absolute inset-x-0 -top-px bottom-0 cursor-row-resize touch-none",
          // Over the handle, the target goes 20px over the map, so it is easy to take.
          "before:absolute before:-top-5 before:left-1/2 before:h-5 before:w-40 before:-translate-x-1/2",
          focusRingInset,
        )}
      >
        <span
          aria-hidden
          className="absolute top-2.5 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-game-ink-500"
        />
      </button>
    </div>
  );
}
