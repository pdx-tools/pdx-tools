import type { CountryMetric } from "@/wasm/wasm_eu4";
import { formatInt } from "@/lib/format";

/** The chart drawer entries that show one value for each analyzed save. */
export type BySaveViz = "dev-by-save" | "army-by-save" | "manpower-by-save" | "world-dev-by-save";

export type BySaveFigure = {
  title: string;
  unit: string;
  /** The country metric, or none for the world total. */
  metric: CountryMetric | null;
  /** The value as the viewer shows it. */
  format: (value: number) => string;
  /** A round value on the axis. */
  tick: (value: number) => string;
};

const points = (value: number) => formatInt(value);
// Below 100K a decimal keeps apart figures that rank apart, such as 9.5K and 10.5K.
const thousands = (value: number) =>
  Math.abs(value) < 100
    ? `${value.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}K`
    : `${formatInt(value)}K`;

/** Each figure is a number that the viewer shows for one save, in the same unit and rounding. */
export const bySaveFigures: Record<BySaveViz, BySaveFigure> = {
  "dev-by-save": {
    title: "Development by save",
    unit: "development points",
    metric: "provinceDevelopment",
    format: points,
    tick: points,
  },
  "army-by-save": {
    title: "Army size by save",
    unit: "thousands of men",
    metric: "armySize",
    format: thousands,
    tick: (value: number) => `${formatInt(value)}K`,
  },
  "manpower-by-save": {
    title: "Max manpower by save",
    unit: "thousands of men",
    metric: "maxManpower",
    format: thousands,
    tick: (value: number) => `${formatInt(value)}K`,
  },
  "world-dev-by-save": {
    title: "World development by save",
    unit: "development points",
    metric: null,
    format: points,
    tick: points,
  },
};

export const bySaveVizs = Object.keys(bySaveFigures) as BySaveViz[];
