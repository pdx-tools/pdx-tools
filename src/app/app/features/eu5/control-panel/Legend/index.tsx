import { useEu5MapMode, useEu5MapModeGradient, useEu5SelectionState } from "../../store";
import { useMapHistory } from "../../history/context";
import { GradientLegend } from "./GradientLegend";

export function Legend() {
  const mapMode = useEu5MapMode();
  const live = useEu5MapModeGradient();
  const selection = useEu5SelectionState();
  // A snapshot on the map has its own legend, fit to all land.
  const shown = useMapHistory()?.preview?.shown;
  const gradient = shown ? shown.gradient : live;
  const ofSelection = !shown && selection?.isEmpty === false;

  if (!gradient) return null;
  return <GradientLegend mode={mapMode} gradient={gradient} ofSelection={ofSelection} />;
}
