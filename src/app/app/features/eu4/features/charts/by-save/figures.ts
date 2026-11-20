import type { CountryMetric } from "@/wasm/wasm_eu4";
import { formatInt } from "@/lib/format";

/** The chart drawer entries that show one value for each analyzed save. */
export type BySaveViz = "dev-by-save" | "army-by-save" | "manpower-by-save" | "world-dev-by-save";

export type BySaveFigure = {
  title: string;
  unit: string;
  /** The country metric, or none for the world total. */
  metric: CountryMetric | null;
  /** The value as the viewer shows it, also on the axis. */
  format: (value: number) => string;
};

const points = (value: number) => formatInt(value);
const thousands = (value: number) => `${formatInt(value)}K`;

/** Each figure is a number that the viewer shows for one save, in the same unit and rounding. */
export const bySaveFigures: Record<BySaveViz, BySaveFigure> = {
  "dev-by-save": {
    title: "Development by save",
    unit: "development points",
    metric: "provinceDevelopment",
    format: points,
  },
  "army-by-save": {
    title: "Army size by save",
    unit: "thousands of men",
    metric: "armySize",
    format: thousands,
  },
  "manpower-by-save": {
    title: "Max manpower by save",
    unit: "thousands of men",
    metric: "maxManpower",
    format: thousands,
  },
  "world-dev-by-save": {
    title: "World development by save",
    unit: "development points",
    metric: null,
    format: points,
  },
};

export const bySaveVizs = Object.keys(bySaveFigures) as BySaveViz[];
