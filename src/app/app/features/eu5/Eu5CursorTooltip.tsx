import { CursorTooltip } from "@/components/CursorTooltip";
import type { CursorPosition } from "@/components/CursorTooltip";
import { useEu5HoverData, useEu5BoxSelectRect } from "./store";
import { formatFloat, formatInt } from "@/lib/format";
import type { DisplayData, HoverStat } from "@/wasm/wasm_eu5";

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
    case "taxGap":
    case "stateEfficacy":
      return formatFloat(stat.value.value, 2);
    case "population":
    case "rgoLevel":
    case "buildingLevels":
      return formatInt(stat.value.value);
    case "markets":
      return `${formatInt(stat.value.access * 100)}%`;
    case "religion":
      return stat.value.religion.name;
  }

  const _exhaustive: never = stat;
  return _exhaustive;
}

function getTooltipContent(hoverData: DisplayData): TooltipContent | null {
  switch (hoverData.kind) {
    case "clear":
      return null;
    case "location":
      return {
        name: hoverData.location.name,
        stat: formatHoverStat(hoverData.stat),
      };
    case "country":
      return {
        name: hoverData.country.country.name,
        stat: formatHoverStat(hoverData.stat),
      };
    case "market":
      return {
        name: hoverData.market.name,
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
        <div className="rounded-[3px] border border-game-line-strong bg-game-overlay px-2.5 py-1.5 font-game-ui text-xs text-game-ink-100 shadow-lg backdrop-blur-sm">
          <span className="font-medium">{content.name}</span>
          {content.stat && (
            <span className="ml-2 font-game-num text-game-ink-500">{content.stat}</span>
          )}
        </div>
      )}
    </CursorTooltip>
  );
}
