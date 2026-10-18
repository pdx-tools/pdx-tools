import { useEu5MapMode, useEu5MapModeGradient } from "../../store";
import { useMapHistory } from "../../history/context";
import { GradientLegend } from "./GradientLegend";

export function Legend() {
  const mapMode = useEu5MapMode();
  const live = useEu5MapModeGradient();
  // A snapshot on the map has its own legend.
  const shown = useMapHistory()?.preview?.shown;
  const gradient = shown ? shown.gradient : live;

  if (!gradient) return null;
  return <GradientLegend mode={mapMode} gradient={gradient} />;
}
