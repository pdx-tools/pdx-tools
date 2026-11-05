import type React from "react";
import type { MapMode } from "@/wasm/wasm_eu5";
import { useEu5MapMode, useEu5SelectionState } from "../store";
import { StateEfficacyInsight } from "../features/insights/StateEfficacy";
import { ControlInsight } from "../features/insights/Control";
import { DevelopmentInsight } from "../features/insights/DevelopmentInsight";
import { WealthInsight } from "../features/insights/Wealth";
import { UnrealizedTaxBaseInsight } from "../features/insights/UnrealizedTaxBase";
import { MarketsInsight } from "../features/insights/Markets";
import { PopulationInsight } from "../features/insights/Population";
import { PopulationGrowthInsight } from "../features/insights/PopulationGrowth";
import { BuildingLevelsInsight } from "../features/insights/BuildingLevels";
import { ReligionInsight } from "../features/insights/ReligionInsight";
import { RgoInsight } from "../features/insights/Rgo";
import { WorldStandings } from "./Standings";
import { EntityProfileRoot } from "../features/profiles";
import type { PanelNavEntry } from "../features/profiles/PanelNavContext";
import { Caption } from "./Caption";
import { ModeRanking, useRanking } from "./ModeRanking";
import { ShareCurve } from "./ShareCurve";
import { useFullView } from "./fullView";
import { Finding } from "./parts";
import { namedShareFinding, scopeLand, topShareFinding } from "./selection";
import { CompareLevel } from "./CompareLevel";
import { ItemLensLevel } from "./ItemLens";

/**
 * The column at rest and the stable view of a selection have one width, so a
 * selection does not move the map.
 */
export const NARROW_WIDTH = 420;
/** A level with rows, tables and charts. The full view gives the level the frame. */
const WIDE_WIDTH = 640;

/**
 * A level has one of two widths: the width of a list, or the width of an analysis.
 * More widths move the map and its tools at each step and teach nothing.
 */
export function levelWidth(entry: PanelNavEntry | undefined): number {
  if (entry === undefined) return NARROW_WIDTH;
  switch (entry.kind) {
    case "insight":
    case "compare":
      return WIDE_WIDTH;
    case "lens":
      return NARROW_WIDTH;
    case "focus":
    case "profile":
      return entry.profile.kind === "market" ? WIDE_WIDTH : NARROW_WIDTH;
    case "section":
      switch (entry.section) {
        case "religion":
        case "buildings":
          return NARROW_WIDTH;
        case "population":
        case "goods":
        case "members":
        case "locations":
        case "diplomacy":
          return WIDE_WIDTH;
      }
  }
}

const INSIGHTS: Record<MapMode, () => React.ReactNode> = {
  political: () => <WorldStandings />,
  control: () => <ControlInsight />,
  development: () => <DevelopmentInsight />,
  stateEfficacy: () => <StateEfficacyInsight />,
  wealth: () => <WealthInsight />,
  unrealizedTaxBase: () => <UnrealizedTaxBaseInsight />,
  markets: () => <MarketsInsight />,
  population: () => <PopulationInsight />,
  populationGrowth: () => <PopulationGrowthInsight />,
  buildingLevels: () => <BuildingLevelsInsight />,
  religion: () => <ReligionInsight />,
  rgoLevel: () => <RgoInsight />,
};

/**
 * What the rows of a mode hold, for the line that says how concentrated it is.
 * A ratio has no total to hold, and the political list is the top ten only.
 */
const DETAILS_METRIC: Partial<Record<MapMode, string>> = {
  development: "development",
  stateEfficacy: "effective development",
  wealth: "wealth",
  unrealizedTaxBase: "the tax base gap",
  population: "the population",
  religion: "the followers",
  markets: "the market value",
  buildingLevels: "the building levels",
};

/** The open level of the column */
export function LevelView({ entry }: { entry: PanelNavEntry | undefined }) {
  if (entry === undefined) return <Caption />;
  if (entry.kind === "insight") return <InsightLevel />;
  if (entry.kind === "compare") return <CompareLevel />;
  if (entry.kind === "lens") return <ItemLensLevel item={entry.item} name={entry.label} />;
  if (entry.kind === "section") {
    return <EntityProfileRoot identity={entry.profile} section={entry.section} />;
  }
  return <EntityProfileRoot identity={entry.profile} />;
}

/** The mode's insight. In the full view its list stands beside the charts, linked to them. */
function InsightLevel() {
  const mode = useEu5MapMode();
  const ranking = useRanking(mode);
  const full = useFullView().on;
  const selection = useEu5SelectionState();
  const metric = DETAILS_METRIC[mode];
  const scoped = selection != null && !selection.isEmpty;
  const finding =
    ranking && metric
      ? scoped
        ? namedShareFinding(ranking.rows, metric, scopeLand(selection))
        : topShareFinding(
            ranking.noun.toLowerCase(),
            metric,
            ranking.rows.map((row) => row.value),
          )
      : null;
  const list = full && mode !== "political" && ranking;
  return (
    <div className="flex flex-col">
      {finding ? (
        <div className="flex items-center gap-3 pr-3.5">
          <Finding>{finding}</Finding>
          {ranking && metric && !scoped ? (
            <ShareCurve
              values={ranking.rows.map((row) => row.value)}
              noun={ranking.noun}
              metric={metric}
            />
          ) : null}
        </div>
      ) : null}
      {/* Who comes first, and the charts explain them. */}
      <div className={list ? "grid grid-cols-[400px_minmax(0,1fr)]" : undefined}>
        {list ? (
          <div className="border-r border-game-line pt-2">
            <ModeRanking key={mode} mode={mode} />
          </div>
        ) : null}
        <div className="@container/level min-w-0">{INSIGHTS[mode]()}</div>
      </div>
    </div>
  );
}
