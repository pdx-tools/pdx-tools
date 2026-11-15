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
 * The labels under the ramp, and a note on the land past each clipped end of
 * the scale. A clipped bottom label reads "≤N" and a clipped top label reads
 * "N+", because the end colors also show that land.
 */
export function gradientKey(
  mode: MapMode,
  gradient: GradientConfig,
  ofSelection: boolean,
): { ticks: string[]; notes: string[] } {
  const kind = tickKind(mode);
  const unit = mode === "populationGrowth" ? "/yr" : "";
  const label = (tick: string) => (tick === "0" ? tick : `${tick}${unit}`);
  const format = (values: number[]) => formatScaleTicks(values, kind).map(label);
  const [min, mid, max] = format([gradient.minValue, gradient.midValue, gradient.maxValue]);
  const locations = ofSelection ? "selected locations" : "locations";
  const { clipBelow, clipAbove } = gradient;
  const notes: string[] = [];
  if (clipBelow) {
    const [lowest] = format([clipBelow.extreme]);
    notes.push(`${formatPercent(clipBelow.share)} of ${locations} below ${min}, lowest ${lowest}`);
  }
  if (clipAbove) {
    const [highest] = format([clipAbove.extreme]);
    notes.push(
      `${formatPercent(clipAbove.share)} of ${locations} above ${max}, highest ${highest}`,
    );
  }
  return {
    ticks: [clipBelow ? `≤${min}` : min, mid, clipAbove ? `${max}+` : max],
    notes,
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
  const { ticks, notes } = gradientKey(mode, gradient, ofSelection);

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
      {notes.map((note) => (
        <p key={note} className="text-[12px] text-game-ink-500">
          {note}
        </p>
      ))}
    </div>
  );
}
