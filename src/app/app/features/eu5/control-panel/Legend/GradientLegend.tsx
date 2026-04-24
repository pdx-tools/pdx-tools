import { formatFloat, formatInt } from "@/lib/format";
import type { MapMode } from "@/wasm/wasm_eu5";
import type { MapModeRange } from "../../game-adapter";

function formatValue(mode: MapMode, value: number): string {
  switch (mode) {
    case "control":
      return `${formatFloat(value * 100, 1)}%`;
    case "population":
      if (value >= 1000) return `${formatFloat(value / 1000, 1)}K`;
      return formatInt(value);
    case "development":
    case "buildingLevels":
    case "rgoLevel":
    case "possibleTax":
    case "taxGap":
      return formatFloat(value, 1);
    default:
      return formatFloat(value, 2);
  }
}

// Dark red → brown → green (standard), or brown → green (2-stop)
const GRADIENT_STANDARD = "linear-gradient(to right, rgb(20,5,5), rgb(101,67,33), rgb(34,139,34))";
const GRADIENT_TWO_STOP = "linear-gradient(to right, rgb(101,67,33), rgb(34,139,34))";
const GRADIENT_DIVERGING = "linear-gradient(to right, rgb(20,5,5), rgb(101,67,33), rgb(34,139,34))";

// Modes whose range is fixed rather than data-driven
const FIXED_RANGE: Partial<Record<MapMode, { min: number; max: number }>> = {
  control: { min: 0, max: 1 },
};

// Modes that use a 2-stop gradient (no midpoint)
const TWO_STOP = new Set<MapMode>(["rgoLevel", "control"]);

type Props = {
  mode: MapMode;
  range: MapModeRange;
};

export function GradientLegend({ mode, range }: Props) {
  const fixed = FIXED_RANGE[mode];
  const min = fixed?.min ?? range.minValue;
  const max = fixed?.max ?? range.maxValue;
  const twoStop = TWO_STOP.has(mode);
  const diverging = mode === "taxGap";
  const mid = (min + max) / 2;

  return (
    <div className="flex flex-col gap-1 px-3.5 pb-2">
      <div
        className="h-1.5 w-full rounded-full"
        style={{
          background: diverging
            ? GRADIENT_DIVERGING
            : twoStop
              ? GRADIENT_TWO_STOP
              : GRADIENT_STANDARD,
        }}
      />
      <div className="flex justify-between font-mono text-[10px] text-eu5-ink-500">
        <span>{formatValue(mode, min)}</span>
        {!twoStop && <span>{formatValue(mode, diverging ? 0 : mid)}</span>}
        <span>{formatValue(mode, max)}</span>
      </div>
    </div>
  );
}
