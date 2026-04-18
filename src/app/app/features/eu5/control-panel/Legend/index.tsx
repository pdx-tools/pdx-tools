import { useEu5MapMode, useEu5MapModeRange } from "../../store";
import { GRADIENT_MODES } from "../modeConfig";
import { GradientLegend } from "./GradientLegend";

export function Legend() {
  const mapMode = useEu5MapMode();
  const mapModeRange = useEu5MapModeRange();

  if (!GRADIENT_MODES.has(mapMode) || !mapModeRange) return null;
  return <GradientLegend mode={mapMode} range={mapModeRange} />;
}
