import { cx } from "class-variance-authority";
import {
  formatCount,
  formatFixed,
  formatLevel,
  formatMetric,
  formatPercent,
  formatRate,
} from "@/lib/format";
import type { GradientConfig, MapMode } from "@/wasm/wasm_eu5";
import { useEu5PaletteGradients } from "../../store";

export function formatLegendValue(mode: MapMode, value: number): string {
  switch (mode) {
    case "control":
      return formatPercent(value);
    case "populationGrowth":
      return `${formatRate(value)}/yr`;
    case "population":
    case "buildingLevels":
      return formatCount(value);
    case "rgoLevel":
      return formatLevel(value);
    default:
      return formatMetric(value);
  }
}

/** What the colour of each location encodes, for the line over the scale */
const ENCODES: Partial<Record<MapMode, string>> = {
  control: "control",
  development: "dev",
  stateEfficacy: "eff. dev",
  wealth: "wealth",
  unrealizedTaxBase: "tax gap",
  population: "pop",
  populationGrowth: "growth",
  rgoLevel: "RGO level",
  buildingLevels: "building levels",
};

const TICK_UNITS = [
  { size: 1_000_000_000, suffix: "B" },
  { size: 1_000_000, suffix: "M" },
  { size: 1_000, suffix: "K" },
] as const;

/**
 * The ticks of one legend in one form: one unit and one number of decimals, and
 * rounded ends. The fewest decimals that keep the three ticks apart: none for a
 * range of 10 or more in its unit. The exact value of a selected location is on
 * its marker. A zero in a larger unit is "0" and needs no unit.
 */
export function legendTicks(mode: MapMode, values: readonly number[]): string[] {
  if (mode === "populationGrowth") return values.map((v) => formatLegendValue(mode, v));
  const percent = mode === "control";
  const scaled = values.map((v) => (percent ? v * 100 : v));
  const largest = Math.max(0, ...scaled.map(Math.abs));
  const unit = percent ? undefined : TICK_UNITS.find((u) => largest >= u.size);
  const size = unit?.size ?? 1;
  const range = largest / size;
  const digits = range >= 10 ? 0 : range >= 1 ? 1 : 2;
  return scaled.map((v) => {
    if (v === 0) return "0";
    return `${formatFixed(v / size, digits)}${percent ? "%" : (unit?.suffix ?? "")}`;
  });
}

type Props = {
  mode: MapMode;
  gradient: GradientConfig;
  /** A value to mark on the scale, such as the selected location's */
  marker?: number;
  /** The selection that the scale is fitted to, if it is not the world */
  scope?: string;
};

/**
 * Where a value sits on the drawn scale. The labels stand at the ends and
 * the middle, so each half of the bar is linear between its two labels.
 */
export function legendPosition(gradient: GradientConfig, value: number): number {
  const { minValue: min, midValue: mid, maxValue: max } = gradient;
  const half = (from: number, to: number, x: number) =>
    to === from ? 0 : (x - from) / (to - from);
  const pos = value <= mid ? half(min, mid, value) * 0.5 : 0.5 + half(mid, max, value) * 0.5;
  return Math.max(0, Math.min(1, Number.isFinite(pos) ? pos : 0));
}

/** The colour at a position on a palette's CSS gradient, so a row can show its colour on the map */
export function rampColor(css: string, at: number): string | undefined {
  const stops = [...css.matchAll(/rgb\((\d+), (\d+), (\d+)\) ([\d.]+)%/g)].map((m) => ({
    rgb: [Number(m[1]), Number(m[2]), Number(m[3])],
    offset: Number(m[4]) / 100,
  }));
  if (stops.length === 0) return undefined;
  const after = stops.findIndex((s) => s.offset >= at);
  if (after <= 0) return `rgb(${(after === 0 ? stops[0] : stops[stops.length - 1]).rgb.join(",")})`;
  const [a, b] = [stops[after - 1], stops[after]];
  const t = b.offset === a.offset ? 0 : (at - a.offset) / (b.offset - a.offset);
  return `rgb(${a.rgb.map((v, i) => Math.round(v + (b.rgb[i] - v) * t)).join(",")})`;
}

export function GradientLegend({ mode, gradient, marker, scope }: Props) {
  const paletteGradients = useEu5PaletteGradients();
  const at = marker === undefined ? null : legendPosition(gradient, marker);
  const what = ENCODES[mode] ?? "value";
  const encodes = `${what[0].toUpperCase()}${what.slice(1)} per location${scope ? ` · scaled to ${scope}` : ""}`;
  const ticks = legendTicks(mode, [gradient.minValue, gradient.midValue, gradient.maxValue]);
  // The label stays inside the bar at the two ends.
  const align =
    at === null
      ? ""
      : at < 0.12
        ? "translate-x-0"
        : at > 0.88
          ? "-translate-x-full"
          : "-translate-x-1/2";

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 max-md:flex-row max-md:items-center max-md:gap-2">
      {/* The line names what the scale encodes, because a list beside it can have another unit.
          A long name wraps, so the selection's name stays whole. */}
      <div className="font-game-ui text-[12px] leading-tight text-game-ink-300 max-md:hidden">
        {encodes}
      </div>
      <div className="shrink-0 font-game-ui text-[12px] leading-tight text-game-ink-300 capitalize md:hidden">
        {what}
      </div>
      {at !== null && marker !== undefined ? (
        <div className="relative h-5">
          <span
            className={`absolute bottom-0.5 font-game-num text-[14px] leading-none font-medium whitespace-nowrap text-game-accent-100 tabular-nums ${align}`}
            style={{ left: `${at * 100}%` }}
          >
            {formatLegendValue(mode, marker)}
          </span>
        </div>
      ) : null}
      {/* On a phone the map has little height, so the ramp and its ends take one line. */}
      <div className="relative max-md:order-2 max-md:flex-1">
        <div
          className="h-1.5 w-full rounded-[2px] outline outline-game-rim"
          style={{ background: paletteGradients[gradient.palette] }}
        />
        {at !== null ? (
          <span
            aria-hidden
            className="absolute -top-1 h-3.5 w-[3px] -translate-x-1/2 rounded-[1px] bg-game-accent-100 ring-1 ring-black/60"
            style={{ left: `${at * 100}%` }}
          />
        ) : null}
      </div>
      <div className="flex justify-between font-game-num text-[12px] text-game-ink-500 tabular-nums max-md:contents">
        {ticks.map((tick, i) => (
          <span
            key={i}
            className={cx(
              "shrink-0",
              i === 0 ? "max-md:order-1" : "max-md:order-3",
              i === 1 && "max-md:hidden",
            )}
          >
            {tick}
          </span>
        ))}
      </div>
    </div>
  );
}
