import type React from "react";
import type { MapMode } from "@/wasm/wasm_eu5";
import { useEu5MapMode } from "../store";
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
import { PoliticalInsight } from "../features/insights/Political";
import { EntityProfileRoot } from "../features/profiles";
import type { PanelNavEntry } from "../features/profiles/PanelNavContext";
import { Caption } from "./Caption";
import { useRanking } from "./ModeRanking";
import { Finding } from "./parts";
import { topShareFinding } from "./selection";
import { CompareLevel } from "./CompareLevel";

/** The caption and the levels that are one list of key and value rows */
export const NARROW_WIDTH = 340;
/** A level with rows, tables and charts. Expand gives the level the frame. */
const WIDE_WIDTH = 640;

/**
 * A level has one of two widths: the width of a list, or the width of an analysis.
 * More widths move the map and its tools at each step and teach nothing. Compare
 * with five countries or more scrolls sideways.
 */
export function levelWidth(entry: PanelNavEntry | undefined): number {
  if (entry === undefined) return NARROW_WIDTH;
  switch (entry.kind) {
    case "insight":
    case "compare":
      return WIDE_WIDTH;
    case "focus":
      return NARROW_WIDTH;
    case "profile":
      return entry.profile.kind === "location" ? NARROW_WIDTH : WIDE_WIDTH;
    case "section":
      switch (entry.section) {
        case "religion":
        case "buildings":
          return NARROW_WIDTH;
        case "population":
          return entry.profile.kind === "location" ? WIDE_WIDTH : WIDE_WIDTH;
        case "goods":
        case "members":
          return WIDE_WIDTH;
        case "locations":
        case "diplomacy":
          return WIDE_WIDTH;
      }
  }
}

const INSIGHTS: Record<MapMode, () => React.ReactNode> = {
  political: () => <PoliticalInsight />,
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
  if (entry.kind === "section") {
    return <EntityProfileRoot identity={entry.profile} section={entry.section} />;
  }
  return <EntityProfileRoot identity={entry.profile} />;
}

/** The mode's insight, made for a wide frame */
function InsightLevel() {
  const mode = useEu5MapMode();
  const ranking = useRanking(mode);
  const metric = DETAILS_METRIC[mode];
  const finding =
    ranking && metric
      ? topShareFinding(
          ranking.noun.toLowerCase(),
          metric,
          ranking.rows.map((row) => row.value),
        )
      : null;
  return (
    <div className="flex flex-col">
      {finding ? <Finding>{finding}</Finding> : null}
      {INSIGHTS[mode]()}
    </div>
  );
}
