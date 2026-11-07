import { GameButton } from "@/components/game/Button";
import type { MapMode } from "@/wasm/wasm_eu5";
import { InsightReadout, InsightReadoutSkeleton, ReadoutFigure } from "../InsightReadout";
import { useEu5Engine } from "../../store";
import { formatRate } from "../../numberFormatting";
import { Figure } from "../../components/Figure";
import { formatDoubling } from "./populationFormatting";

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
        figure={<Figure value={props.figures.totalPopulation} form="count" />}
        unit="people"
        action={action}
      >
        <ReadoutFigure
          value={<Figure value={props.figures.urbanization} form="percent" />}
          label="urban"
        />
        <ReadoutFigure
          value={<Figure value={props.figures.peasantPopulation} form="count" />}
          label="peasants"
        />
      </InsightReadout>
    );
  }

  const births = props.figures.birthsPerYear;
  return (
    <InsightReadout
      figure={<Figure value={births} form="count" prefix={births > 0 ? "+" : ""} />}
      unit="people / yr"
      action={action}
    >
      <ReadoutFigure value={formatRate(props.figures.growthRate)} label="growth / yr" />
      <ReadoutFigure value={formatDoubling(props.figures.growthRate)} />
      <ReadoutFigure
        value={<Figure value={props.figures.totalPopulation} form="count" />}
        label="people"
      />
    </InsightReadout>
  );
}
