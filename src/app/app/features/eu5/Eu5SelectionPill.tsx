import { useCallback } from "react";
import { useEu5SelectionState, useEu5Engine, useEu5TimelineBarHeight } from "./store";
import { XMarkIcon } from "@heroicons/react/24/solid";
import { cx } from "class-variance-authority";
import { formatInt } from "@/lib/format";
import { focusRing } from "@/components/game/focusRing";

function formatSelectionSummary(entityCount: number, locationCount: number): string {
  const locPart = locationCount === 1 ? "1 location" : `${formatInt(locationCount)} locations`;
  if (entityCount === 1) return locPart;
  return `${locPart}`;
}

/** Distance from the map edge, and from the timeline bar when it shows. */
const PILL_BOTTOM_PX = 16;
const PILL_GAP_PX = 8;

export function Eu5SelectionPill() {
  const selectionState = useEu5SelectionState();
  const engine = useEu5Engine();
  const timelineBarHeight = useEu5TimelineBarHeight();

  const handleClear = useCallback(async () => {
    await engine.trigger.clearSelection();
  }, [engine]);

  if (selectionState == null || selectionState.isEmpty) {
    return null;
  }

  const name =
    selectionState.preset === "players" ? "Players" : (selectionState.scopeDisplayName ?? null);

  const meta = formatSelectionSummary(selectionState.entityCount, selectionState.locationCount);

  return (
    <div
      className="pointer-events-auto absolute left-84 z-20 inline-flex h-7 items-center gap-2 rounded-panel border border-game-accent-line bg-game-overlay px-2.5 font-game-ui shadow-lg backdrop-blur-md transition-[bottom] duration-200 ease-out motion-reduce:transition-none"
      // Sits above the timeline bar and follows it as the bar comes and goes.
      style={{
        bottom: PILL_BOTTOM_PX + (timelineBarHeight > 0 ? timelineBarHeight + PILL_GAP_PX : 0),
      }}
    >
      {name !== null && (
        <>
          <span className="text-[11px] font-semibold text-game-ink-100">{name}</span>
          <span className="h-3.5 w-px shrink-0 bg-game-line-strong" aria-hidden="true" />
        </>
      )}
      <span className="font-game-num text-[10.5px] text-game-accent-100">{meta}</span>
      <button
        type="button"
        onClick={() => void handleClear()}
        className={cx(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-control text-game-ink-500 transition-colors hover:bg-game-panel-hover hover:text-game-ink-100",
          focusRing,
        )}
        aria-label="Clear selection"
      >
        <XMarkIcon className="h-3 w-3" />
      </button>
    </div>
  );
}
