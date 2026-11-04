import ChevronRightIcon from "@heroicons/react/20/solid/ChevronRightIcon";
import { GameButton } from "@/components/game/Button";
import type { MapMode } from "@/wasm/wasm_eu5";
import {
  InsightReadout,
  InsightReadoutSkeleton,
  ReadoutFigure,
  readoutAction,
} from "../InsightReadout";
import { useEu5Engine } from "../../store";
import { formatPercent, formatRate } from "@/lib/format";
import { formatDoubling, formatPeople } from "./populationFormatting";

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
      className={readoutAction}
      onClick={() => engine.trigger.selectMapMode(other)}
    >
      {stock ? "Growth" : "Population"}
      <ChevronRightIcon aria-hidden className="h-3.5 w-3.5" />
    </GameButton>
  );

  if (props.mode === "population") {
    return (
      <InsightReadout
        figure={formatPeople(props.figures.totalPopulation)}
        unit="people"
        action={action}
      >
        <ReadoutFigure value={formatPercent(props.figures.urbanization)} label="urban" />
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
