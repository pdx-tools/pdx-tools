import type React from "react";
import { useEu5MapMode, useEu5MapModeGradient } from "../../store";
import { useMapHistory } from "../../history/context";
import { GradientLegend } from "./GradientLegend";

/** The scale of the open mode. A marker shows where one value sits on it. */
export function Legend({
  marker,
  scope,
  aside,
}: {
  marker?: number;
  scope?: string;
  /** A short key that shares the line over the scale */
  aside?: React.ReactNode;
}) {
  const mapMode = useEu5MapMode();
  const live = useEu5MapModeGradient();
  // A snapshot on the map has its own legend.
  const shown = useMapHistory()?.preview?.shown;
  const gradient = shown ? shown.gradient : live;

  if (!gradient) return null;
  return (
    <GradientLegend
      mode={mapMode}
      gradient={gradient}
      marker={shown ? undefined : marker}
      scope={shown ? undefined : scope}
      aside={aside}
    />
  );
}
