import type { CountryMetric } from "@/wasm/wasm_eu4";
import { formatInt } from "@/lib/format";

/** The chart drawer entries that show one value for each analyzed save. */
export type BySaveViz = "dev-by-save" | "army-by-save" | "manpower-by-save" | "world-dev-by-save";

export type BySaveFigure = {
  title: string;
  /** The axis title, with the unit. */
  axis: string;
  /** The country metric, or none for the world total. */
  metric: CountryMetric | null;
  format: (value: number) => string;
};

const points = (value: number) => formatInt(value);
const thousands = (value: number) => `${formatInt(value)}K`;

/** Each figure is a number that the viewer shows for one save, in the same unit and rounding. */
export const bySaveFigures: Record<BySaveViz, BySaveFigure> = {
  "dev-by-save": {
    title: "Development by save",
    axis: "Development, points",
    metric: "provinceDevelopment",
    format: points,
  },
  "army-by-save": {
    title: "Army size by save",
    axis: "Army size, thousands of men",
    metric: "armySize",
    format: thousands,
  },
  "manpower-by-save": {
    title: "Max manpower by save",
    axis: "Max manpower, thousands of men",
    metric: "maxManpower",
    format: thousands,
  },
  "world-dev-by-save": {
    title: "World development by save",
    axis: "Development, points",
    metric: null,
    format: points,
  },
};

export const bySaveVizs = Object.keys(bySaveFigures) as BySaveViz[];

export function isBySaveViz(viz: string): viz is BySaveViz {
  return viz in bySaveFigures;
}
