import { CursorTooltip } from "@/components/CursorTooltip";
import type { CursorPosition } from "@/components/CursorTooltip";
import { useEu5HoverData, useEu5BoxSelectRect } from "./store";
import { formatFloat, formatInt } from "@/lib/format";
import type { HoverDisplayData, HoverStat } from "@/wasm/wasm_eu5";

interface Eu5CursorTooltipProps {
  cursorRef: React.RefObject<CursorPosition>;
}

interface TooltipContent {
  name: string;
  stat: string | null;
}

function formatHoverStat(stat: HoverStat): string | null {
  switch (stat.mode) {
    case "none":
      return null;
    case "control":
      return `${formatFloat(stat.value.value * 100, 2)}%`;
    case "development":
    case "possibleTax":
    case "stateEfficacy":
      return formatFloat(stat.value.value, 2);
    case "population":
    case "rgoLevel":
    case "buildingLevels":
      return formatInt(stat.value.value);
    case "markets":
      return `${formatInt(stat.value.access * 100)}%`;
    case "religion":
      return stat.value.name;
  }

  const _exhaustive: never = stat;
  return _exhaustive;
}

function getTooltipContent(hoverData: HoverDisplayData): TooltipContent | null {
  switch (hoverData.kind) {
    case "clear":
      return null;
    case "location":
      return {
        name: hoverData.locationName,
        stat: formatHoverStat(hoverData.stat),
      };
    case "country":
      return {
        name: hoverData.countryName,
        stat: formatHoverStat(hoverData.stat),
      };
    case "market":
      return {
        name: hoverData.marketCenterName,
        stat: formatFloat(hoverData.marketValue, 2),
      };
  }

  const _exhaustive: never = hoverData;
  return _exhaustive;
}

export function Eu5CursorTooltip({ cursorRef }: Eu5CursorTooltipProps) {
  const hoverData = useEu5HoverData();
  const isBoxSelecting = useEu5BoxSelectRect() !== null;

  const content = !isBoxSelecting && hoverData ? getTooltipContent(hoverData) : null;

  return (
    <CursorTooltip cursorRef={cursorRef} visible={content !== null}>
      {content && (
        <div className="rounded-md border border-white/10 bg-slate-900/90 px-2.5 py-1.5 text-xs text-slate-100 shadow-lg backdrop-blur-sm">
          <span className="font-medium">{content.name}</span>
          {content.stat && <span className="ml-2 font-mono text-slate-400">{content.stat}</span>}
        </div>
      )}
    </CursorTooltip>
  );
}
