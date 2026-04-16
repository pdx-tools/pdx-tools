import { CursorTooltip } from "@/components/CursorTooltip";
import type { CursorPosition } from "@/components/CursorTooltip";
import { useEu5HoverData, useEu5MapMode } from "./store";
import { formatFloat, formatInt } from "@/lib/format";
import type { HoverDisplayData, MapMode } from "@/wasm/wasm_eu5";

interface Eu5CursorTooltipProps {
  cursorRef: React.RefObject<CursorPosition>;
}

interface TooltipContent {
  name: string;
  stat: string | null;
}

function getLocationStat(
  data: Extract<HoverDisplayData, { kind: "location" }>,
  mode: MapMode,
): string | null {
  switch (mode) {
    case "development":
      return data.development !== undefined ? formatFloat(data.development, 2) : null;
    case "population":
      return data.population !== undefined ? formatInt(data.population) : null;
    case "control":
      return data.controlValue !== undefined ? `${formatFloat(data.controlValue * 100, 2)}%` : null;
    case "rgoLevel":
      return data.rgoLevel !== undefined ? formatInt(data.rgoLevel) : null;
    case "buildingLevels":
      return data.buildingLevel !== undefined ? formatInt(data.buildingLevel) : null;
    case "possibleTax":
      return data.possibleTax !== undefined ? formatFloat(data.possibleTax, 2) : null;
    case "markets":
      return data.marketAccess !== undefined ? `${formatInt(data.marketAccess * 100)}%` : null;
    case "religion":
      return data.locationReligionName ?? null;
    case "political":
    case "stateEfficacy":
    default:
      return null;
  }
}

function getCountryStat(
  data: Extract<HoverDisplayData, { kind: "country" }>,
  mode: MapMode,
): string | null {
  switch (mode) {
    case "development":
      return data.totalDevelopment !== undefined ? formatFloat(data.totalDevelopment, 2) : null;
    case "population":
      return data.totalPopulation !== undefined ? formatInt(data.totalPopulation) : null;
    case "control":
      return data.averageControlValue !== undefined
        ? `${formatFloat(data.averageControlValue * 100, 2)}%`
        : null;
    case "rgoLevel":
      return data.totalRgoLevel !== undefined ? formatInt(data.totalRgoLevel) : null;
    case "buildingLevels":
      return data.totalBuildingLevels !== undefined ? formatInt(data.totalBuildingLevels) : null;
    case "possibleTax":
      return data.totalPossibleTax !== undefined ? formatFloat(data.totalPossibleTax, 2) : null;
    case "markets":
      return data.marketValue !== undefined ? formatFloat(data.marketValue, 2) : null;
    case "religion":
      return data.countryReligionName ?? null;
    case "political":
      return data.countryTag ? `(${data.countryTag})` : null;
    case "stateEfficacy":
    default:
      return null;
  }
}

function getTooltipContent(hoverData: HoverDisplayData, mapMode: MapMode): TooltipContent | null {
  if (hoverData.kind === "clear") return null;

  if (hoverData.kind === "location") {
    return {
      name: hoverData.locationName,
      stat: getLocationStat(hoverData, mapMode),
    };
  }

  if (hoverData.kind === "country") {
    return {
      name: hoverData.marketCenterName || hoverData.countryName,
      stat: getCountryStat(hoverData, mapMode),
    };
  }

  return null;
}

export function Eu5CursorTooltip({ cursorRef }: Eu5CursorTooltipProps) {
  const hoverData = useEu5HoverData();
  const mapMode = useEu5MapMode();

  const content = hoverData ? getTooltipContent(hoverData, mapMode) : null;

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
