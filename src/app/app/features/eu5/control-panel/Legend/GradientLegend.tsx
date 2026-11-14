import type { GradientConfig, MapMode } from "@/wasm/wasm_eu5";
import { useEu5PaletteGradients } from "../../store";
import { formatPercent, formatScaleTicks } from "../../numberFormatting";

function tickKind(mode: MapMode) {
  switch (mode) {
    case "control":
    case "populationGrowth":
      return "percent";
    case "buildingLevels":
    case "rgoLevel":
      return "count";
    default:
      return "amount";
  }
}

/**
 * The labels under the ramp, and a note on the land above the top of a
 * clipped scale. The top label of a clipped scale reads "N+", because the top
 * color also shows that land.
 */
export function gradientKey(
  mode: MapMode,
  gradient: GradientConfig,
  ofSelection: boolean,
): { ticks: string[]; note: string | null } {
  const kind = tickKind(mode);
  const unit = mode === "populationGrowth" ? "/yr" : "";
  const label = (tick: string) => (tick === "0" ? tick : `${tick}${unit}`);
  const [min, mid, max] = formatScaleTicks(
    [gradient.minValue, gradient.midValue, gradient.maxValue],
    kind,
  ).map(label);
  const clip = gradient.clip;
  if (!clip) return { ticks: [min, mid, max], note: null };
  const [highest] = formatScaleTicks([clip.highest], kind).map(label);
  const locations = ofSelection ? "selected locations" : "locations";
  return {
    ticks: [min, mid, `${max}+`],
    note: `${formatPercent(clip.share)} of ${locations} above ${max}, highest ${highest}`,
  };
}

type Props = {
  mode: MapMode;
  gradient: GradientConfig;
  /** The scale fits the selected land, not all land. */
  ofSelection: boolean;
};

export function GradientLegend({ mode, gradient, ofSelection }: Props) {
  const paletteGradients = useEu5PaletteGradients();
  const { ticks, note } = gradientKey(mode, gradient, ofSelection);

  return (
    <div className="flex flex-col gap-1 px-3.5 pb-2">
      <div
        className="h-1.5 w-full rounded-full"
        style={{ background: paletteGradients[gradient.palette] }}
      />
      {/* Each label stands under its place on the ramp, at the ends and the middle. */}
      <div className="grid grid-cols-3 font-game-num text-[12px] text-game-ink-500">
        <span>{ticks[0]}</span>
        <span className="text-center">{ticks[1]}</span>
        <span className="text-right">{ticks[2]}</span>
      </div>
      {note ? <p className="text-[12px] text-game-ink-500">{note}</p> : null}
    </div>
  );
}
