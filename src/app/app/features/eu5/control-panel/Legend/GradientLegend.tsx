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

// EU5 6-stop HSV gradient (stops from game\loading_screen\common\defines\graphic\00_graphics.txt)
const GRADIENT_EU5 =
  "linear-gradient(to right, rgb(4,1,1), rgb(87,13,13), rgb(191,151,10), rgb(35,153,15), rgb(36,255,0), rgb(0,255,240))";
const GRADIENT_DIVERGING = "linear-gradient(to right, rgb(20,5,5), rgb(101,67,33), rgb(34,139,34))";

// Modes whose range is fixed rather than data-driven
const FIXED_RANGE: Partial<Record<MapMode, { min: number; max: number }>> = {
  control: { min: 0, max: 1 },
};

type Props = {
  mode: MapMode;
  range: MapModeRange;
};

// For log-scaled modes the color midpoint is the geometric mean, not the arithmetic mean.
// Mirrors the Rust log normalization: ln_1p(v/1000) / ln_1p(max/1000).
function logMidpoint(max: number): number {
  const maxK = max / 1000;
  return Math.expm1(0.5 * Math.log1p(maxK)) * 1000;
}

export function GradientLegend({ mode, range }: Props) {
  const fixed = FIXED_RANGE[mode];
  const min = fixed?.min ?? range.minValue;
  const max = fixed?.max ?? range.maxValue;
  const diverging = mode === "taxGap";
  const mid = mode === "population" ? logMidpoint(max) : (min + max) / 2;

  return (
    <div className="flex flex-col gap-1 px-3.5 pb-2">
      <div
        className="h-1.5 w-full rounded-full"
        style={{ background: diverging ? GRADIENT_DIVERGING : GRADIENT_EU5 }}
      />
      <div className="flex justify-between font-mono text-[10px] text-eu5-ink-500">
        <span>{formatValue(mode, min)}</span>
        <span>{formatValue(mode, diverging ? 0 : mid)}</span>
        <span>{formatValue(mode, max)}</span>
      </div>
    </div>
  );
}
