import { formatFloat, formatInt } from "@/lib/format";
import type { GradientConfig, MapMode } from "@/wasm/wasm_eu5";
import { useEu5PaletteGradients } from "../../store";

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

type Props = {
  mode: MapMode;
  gradient: GradientConfig;
};

export function GradientLegend({ mode, gradient }: Props) {
  const paletteGradients = useEu5PaletteGradients();

  return (
    <div className="flex flex-col gap-1 px-3.5 pb-2">
      <div
        className="h-1.5 w-full rounded-full"
        style={{ background: paletteGradients[gradient.palette] }}
      />
      <div className="flex justify-between font-mono text-[10px] text-eu5-ink-500">
        <span>{formatValue(mode, gradient.minValue)}</span>
        <span>{formatValue(mode, gradient.midValue)}</span>
        <span>{formatValue(mode, gradient.maxValue)}</span>
      </div>
    </div>
  );
}
