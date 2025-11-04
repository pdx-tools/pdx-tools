import { formatFloat, formatInt } from "@/lib/format";
import { MapLegend } from "./components/MapLegend";
import type { MapLegendData } from "./components/MapLegend";
import { useEu5MapMode, useEu5MapModeRange } from "./store/eu5Store";
import type { MapMode } from "@/wasm/wasm_eu5";

// Map modes that should display a legend
const NUMERIC_MAP_MODES: Record<MapMode, boolean> = {
  political: false,
  control: true,
  development: true,
  population: true,
  markets: false,
  rgoLevel: true,
  buildingLevels: true,
  possibleTax: true,
  religion: false,
};

function formatLegendValue(mode: MapMode, value: number): string {
  switch (mode) {
    case "control":
      // Control is 0-1, display as percentage
      return `${formatFloat(value * 100, 1)}%`;
    case "population":
      // Population in thousands
      if (value >= 1000) {
        return `${formatFloat(value / 1000, 1)}K`;
      }
      return formatInt(value);
    case "development":
    case "buildingLevels":
    case "rgoLevel":
    case "possibleTax":
      // Display with 1 decimal place
      return formatFloat(value, 1);
    default:
      return formatFloat(value, 2);
  }
}

export function Eu5MapLegend() {
  const mapMode = useEu5MapMode();
  const mapModeRange = useEu5MapModeRange();

  // Don't show legend for non-numeric map modes
  if (!NUMERIC_MAP_MODES[mapMode] || !mapModeRange) {
    return null;
  }

  // Special handling for control mode which is 0-1
  const isControlMode = mapMode === "control";
  const minValue = isControlMode ? 0 : mapModeRange.minValue;
  const maxValue = isControlMode ? 1 : mapModeRange.maxValue;
  const midValue = (minValue + maxValue) / 2;

  const legendData: MapLegendData = {
    mode: mapMode,
    minValue,
    maxValue,
    minLabel: formatLegendValue(mapMode, minValue),
    maxLabel: formatLegendValue(mapMode, maxValue),
    midValue,
    midLabel: formatLegendValue(mapMode, midValue),
  };

  return <MapLegend data={legendData} />;
}
