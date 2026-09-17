import { GameButton } from "@/components/game/Button";
import type { MapMode } from "@/wasm/wasm_eu5";
import { InsightReadout, InsightReadoutSkeleton, ReadoutFigure } from "../InsightReadout";
import { useEu5Engine } from "../../store";
import { formatDoubling, formatPeople, formatRate } from "./populationFormatting";

export type PopulationStockFigures = {
  totalPopulation: number;
  urbanization: number;
  peasantPopulation: number;
};

export type PopulationFlowFigures = {
  totalPopulation: number;
  birthsPerYear: number;
  growthRate: number;
};

type PopulationReadoutProps =
  | { mode: "population"; figures: PopulationStockFigures }
  | { mode: "populationGrowth"; figures: PopulationFlowFigures };

export const PopulationReadoutSkeleton = InsightReadoutSkeleton;

/**
 * Population leads with the stock and says who and where the people are;
 * Population Growth leads with the flow. Each hands off to the other with
 * one action.
 */
export function PopulationReadout(props: PopulationReadoutProps) {
  const engine = useEu5Engine();
  const stock = props.mode === "population";
  const other: MapMode = stock ? "populationGrowth" : "population";

  const action = (
    <GameButton
      variant="ghost"
      className="-mr-3 shrink-0"
      onClick={() => engine.trigger.selectMapMode(other)}
    >
      {stock ? "Growth" : "Population"}
      <span aria-hidden="true">→</span>
    </GameButton>
  );

  if (props.mode === "population") {
    return (
      <InsightReadout
        figure={formatPeople(props.figures.totalPopulation)}
        unit="people"
        action={action}
      >
        <ReadoutFigure value={formatRate(props.figures.urbanization, 1)} label="urban" />
        <ReadoutFigure value={formatPeople(props.figures.peasantPopulation)} label="peasants" />
      </InsightReadout>
    );
  }

  const births = props.figures.birthsPerYear;
  return (
    <InsightReadout
      figure={`${births > 0 ? "+" : ""}${formatPeople(births)}`}
      unit="people / yr"
      action={action}
    >
      <ReadoutFigure value={formatRate(props.figures.growthRate)} label="growth / yr" />
      <ReadoutFigure value={formatDoubling(props.figures.growthRate)} />
      <ReadoutFigure value={formatPeople(props.figures.totalPopulation)} label="people" />
    </InsightReadout>
  );
}
