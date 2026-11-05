import type React from "react";
import { cx } from "class-variance-authority";
import {
  formatCount,
  formatFixed,
  formatLevel,
  formatMetric,
  formatPercent,
  formatRate,
  formatTick,
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

/** What the colour of each location encodes, as a name for a label */
export function gradientLabel(mode: MapMode): string {
  const what = ENCODES[mode] ?? "value";
  return `${what[0].toUpperCase()}${what.slice(1)}`;
}

/** The stops of a palette's CSS gradient, for a canvas */
export function paletteStops(css: string): { offset: number; color: string }[] {
  return [...css.matchAll(/rgb\((\d+), (\d+), (\d+)\) ([\d.]+)%/g)].map((m) => ({
    offset: Number(m[4]) / 100,
    color: `rgb(${m[1]},${m[2]},${m[3]})`,
  }));
}

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

/**
 * The ticks of a scale, each at its true place on the ramp. A log scale has a tick at
 * each power of ten, so that its shape can be read. Zero is the low end of the ramp, and
 * a value starts to climb from about the softening of the scale.
 */
/** The least space between two ticks, as a share of the ramp */
const MIN_TICK_GAP = 0.14;

export function legendScaleTicks(
  mode: MapMode,
  gradient: GradientConfig,
): { label: string; at: number }[] {
  const { minValue, midValue, maxValue } = gradient;
  if (gradient.scale !== "log" || maxValue <= 0) {
    const labels = legendTicks(mode, [minValue, midValue, maxValue]);
    // The top of a clamped scale also holds the few values above it.
    return labels.map((label, i) => ({
      label: i === 2 && gradient.clamped ? `${label}+` : label,
      at: i / 2,
    }));
  }
  // Round ticks from the first power of ten above the softening.
  const first = 10 ** Math.ceil(Math.log10(Math.max(1, gradient.softening)));
  const decades: number[] = [];
  for (let value = first; value < maxValue; value *= 10) decades.push(value);
  // Too many ticks crowd the key, so a wide range keeps every other one.
  const kept = decades.length > 4 ? decades.filter((_, i) => i % 2 === 0) : decades;
  const top = {
    label: `${formatTick(maxValue)}${gradient.clamped ? "+" : ""}`,
    at: legendPosition(gradient, maxValue),
  };
  const round = kept
    .map((value) => ({ label: formatTick(value), at: legendPosition(gradient, value) }))
    // A round tick near the top would run into the top's own label.
    .filter((tick) => top.at - tick.at >= MIN_TICK_GAP && tick.at >= MIN_TICK_GAP);
  return [{ label: "0", at: 0 }, ...round, top];
}

type Props = {
  mode: MapMode;
  gradient: GradientConfig;
  /** A value to mark on the scale, such as the selected location's */
  marker?: number;
  /** The selection that the scale is fitted to, if it is not the world */
  scope?: string;
  /** A short key that shares the line over the scale */
  aside?: React.ReactNode;
};

/**
 * Where a value sits on the drawn scale. The labels stand at the ends and
 * the middle, so each half of the bar is linear between its two labels.
 */
export function legendPosition(gradient: GradientConfig, value: number): number {
  const { minValue: min, midValue: mid, maxValue: max } = gradient;
  if (gradient.scale === "log") {
    const top = Math.log1p(max / gradient.softening);
    const at = top > 0 ? Math.log1p(Math.max(0, value) / gradient.softening) / top : 0;
    return Math.max(0, Math.min(1, Number.isFinite(at) ? at : 0));
  }
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

/** The rule of each clipped scale, for the key and the image: where it stops, and the true top */
export function clipNote(mode: MapMode, gradient: GradientConfig): string | null {
  if (!gradient.clamped) return null;
  return `top 2% of land above ${legendTicks(mode, [gradient.maxValue])[0]}, highest ${legendTicks(mode, [gradient.trueMax])[0]}`;
}

export function GradientLegend({ mode, gradient, marker, scope, aside }: Props) {
  const paletteGradients = useEu5PaletteGradients();
  const at = marker === undefined ? null : legendPosition(gradient, marker);
  const what = ENCODES[mode] ?? "value";
  const scale = gradient.scale === "log" ? "log scale" : "linear scale";
  const encodes = `${gradientLabel(mode)} per location · ${scale}${scope ? ` · scaled to ${scope}` : ""}`;
  const clip = clipNote(mode, gradient);
  const ticks = legendScaleTicks(mode, gradient);
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
      <div className="flex items-start justify-between gap-2 font-game-ui text-[12px] leading-tight text-game-ink-300 max-md:hidden">
        <span className="min-w-0">
          {encodes}
          {clip ? ` · ${clip}` : ""}
        </span>
        {aside}
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
      {/* Each tick stands at its true place on the ramp. */}
      <div className="relative h-4 font-game-num text-[12px] text-game-ink-300 tabular-nums max-md:hidden">
        {ticks.map((tick, i) => (
          <span
            key={tick.label}
            className={cx(
              "absolute top-0.5 whitespace-nowrap",
              i === 0 ? "" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2",
            )}
            style={{ left: `${tick.at * 100}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
      <span className="order-1 shrink-0 font-game-num text-[12px] text-game-ink-300 md:hidden">
        {ticks[0]?.label}
      </span>
      <span className="order-3 shrink-0 font-game-num text-[12px] text-game-ink-300 md:hidden">
        {ticks[ticks.length - 1]?.label}
      </span>
    </div>
  );
}
