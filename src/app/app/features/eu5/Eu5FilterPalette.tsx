import { useEu5SelectionState } from "./store/eu5Store";
import { formatInt } from "@/lib/format";

export function Eu5FilterPalette() {
  const selectionState = useEu5SelectionState();

  if (!selectionState || selectionState.isEmpty) {
    return null;
  }

  const summary = formatSelectionSummary(selectionState.entityCount, selectionState.locationCount);

  return (
    <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2">
      <div className="rounded-full border border-white/10 bg-slate-950/80 px-5 py-2.5 text-sm text-slate-100 shadow-xl backdrop-blur-md">
        <span className="font-semibold">{summary}</span>
        {/* Search box will be added here */}
      </div>
    </div>
  );
}

function formatSelectionSummary(entityCount: number, locationCount: number): string {
  const locPart = locationCount === 1 ? "1 location" : `${formatInt(locationCount)} locations`;

  if (entityCount === 1) {
    return locPart;
  }

  return `${formatInt(entityCount)} entities — ${locPart}`;
}
