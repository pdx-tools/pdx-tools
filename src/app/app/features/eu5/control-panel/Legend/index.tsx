import { useEu5MapMode, useEu5MapModeGradient } from "../../store";
import { GradientLegend } from "./GradientLegend";

export function Legend() {
  const mapMode = useEu5MapMode();
  const gradient = useEu5MapModeGradient();

  if (!gradient) return null;
  return <GradientLegend mode={mapMode} gradient={gradient} />;
}
