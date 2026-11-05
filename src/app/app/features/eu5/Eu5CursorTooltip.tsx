import { CursorTooltip } from "@/components/CursorTooltip";
import type { CursorPosition } from "@/components/CursorTooltip";
import { useEu5HoverData, useEu5BoxSelectRect, useEu5Players, useEu5World } from "./store";
import { formatFloat, formatInt, formatMetric } from "@/lib/format";
import type { DisplayData, HoverStat } from "@/wasm/wasm_eu5";

interface Eu5CursorTooltipProps {
  cursorRef: React.RefObject<CursorPosition>;
}

interface TooltipContent {
  name: string;
  stat: string | null;
  /** The second line: who owns the land, who plays it, or what a figure is */
  detail?: string;
}

/** The figure of the open mode, with its name, so that the chip reads alone */
function formatHoverStat(stat: HoverStat, countryCount: number): string | null {
  switch (stat.mode) {
    case "none":
      return null;
    case "greatPower": {
      const { rank, points } = stat.value;
      // A country with no points has no place of its own.
      if (points <= 0) return "No score points";
      const of = rank <= countryCount ? ` of ${formatInt(countryCount)}` : "";
      return `Score ${formatInt(Math.round(points))}, #${formatInt(rank)}${of}`;
    }
    case "control":
      return `Control ${formatFloat(stat.value.value * 100, 1)}%`;
    case "populationGrowth":
      return `Growth ${formatFloat(stat.value.value * 100, 2)}%/yr`;
    case "development":
      return `Development ${formatFloat(stat.value.value, 1)}`;
    case "wealth":
      return `Wealth ${formatFloat(stat.value.value, 1)}`;
    case "unrealizedTaxBase":
      return `Tax base gap ${formatFloat(stat.value.value, 1)}`;
    case "stateEfficacy":
      return `Effective development ${formatFloat(stat.value.value, 1)}`;
    case "population":
      return `Population ${formatInt(stat.value.value)}`;
    case "rgoLevel":
      return `RGO level ${formatInt(stat.value.value)}`;
    case "buildingLevels":
      return `Building levels ${formatInt(stat.value.value)}`;
    case "markets":
      return `Access ${formatInt(stat.value.access * 100)}%`;
    case "religion":
      return stat.value.religion.name;
  }

  const _exhaustive: never = stat;
  return _exhaustive;
}

function getTooltipContent(
  hoverData: DisplayData,
  playerOf: (countryIdx: number) => string | undefined,
  countryCount: number,
): TooltipContent | null {
  switch (hoverData.kind) {
    case "clear":
      return null;
    case "location":
      return {
        name: hoverData.location.name,
        stat: formatHoverStat(hoverData.stat, countryCount),
      };
    case "country":
      return {
        name: hoverData.country.country.name,
        stat: formatHoverStat(hoverData.stat, countryCount),
        detail: playerOf(hoverData.country.country.key),
      };
    case "locationOfCountry": {
      const player = playerOf(hoverData.country.country.key);
      return {
        name: hoverData.location.name,
        stat: formatHoverStat(hoverData.stat, countryCount),
        detail: player
          ? `${hoverData.country.country.name} · ${player}`
          : hoverData.country.country.name,
      };
    }
    case "historicalCountry":
      return {
        name: hoverData.name,
        stat: hoverData.dead ? "no longer exists" : null,
      };
    case "market":
      return {
        name: hoverData.market.name,
        stat: `${formatInt(hoverData.access * 100)}% access`,
        detail: `Market value ${formatMetric(hoverData.marketValue)}`,
      };
  }

  const _exhaustive: never = hoverData;
  return _exhaustive;
}

export function Eu5CursorTooltip({ cursorRef }: Eu5CursorTooltipProps) {
  const hoverData = useEu5HoverData();
  const isBoxSelecting = useEu5BoxSelectRect() !== null;

  const players = useEu5Players();
  const world = useEu5World();
  const playerOf = (countryIdx: number) =>
    players.length > 1 ? players.find((p) => p.countryIdx === countryIdx)?.name : undefined;
  const content =
    !isBoxSelecting && hoverData
      ? getTooltipContent(hoverData, playerOf, world.countryCount)
      : null;

  return (
    <CursorTooltip cursorRef={cursorRef} visible={content !== null}>
      {content && (
        <div className="rounded-control border border-game-line-strong bg-game-overlay px-2.5 py-1.5 font-game-ui text-xs text-game-ink-100 shadow-lg backdrop-blur-sm">
          <span className="font-medium">{content.name}</span>
          {content.stat && (
            <span className="ml-2 font-game-num text-game-ink-300">{content.stat}</span>
          )}
          {content.detail && <div className="mt-0.5 text-game-ink-300">{content.detail}</div>}
        </div>
      )}
    </CursorTooltip>
  );
}
