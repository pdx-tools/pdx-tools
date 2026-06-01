import { useCallback } from "react";
import { useEu5SelectionState, useEu5Engine } from "./store";
import { XMarkIcon } from "@heroicons/react/24/solid";
import { formatInt } from "@/lib/format";

function formatSelectionSummary(entityCount: number, locationCount: number): string {
  const locPart = locationCount === 1 ? "1 location" : `${formatInt(locationCount)} locations`;
  if (entityCount === 1) return locPart;
  return `${locPart}`;
}

export function Eu5SelectionPill() {
  const selectionState = useEu5SelectionState();
  const engine = useEu5Engine();

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
    <div className="pointer-events-auto absolute bottom-4 left-84 z-20 inline-flex h-7 items-center gap-2 rounded-panel border border-game-accent-line bg-game-overlay px-2.5 font-game-ui shadow-lg backdrop-blur-md">
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
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-control text-game-ink-500 transition-colors hover:bg-game-panel-hover hover:text-game-ink-100 focus-visible:ring-2 focus-visible:ring-game-accent-line focus-visible:outline-none"
        aria-label="Clear selection"
      >
        <XMarkIcon className="h-3 w-3" />
      </button>
    </div>
  );
}
