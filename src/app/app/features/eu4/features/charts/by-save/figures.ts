import type { CountryMetric } from "@/wasm/wasm_eu4";
import { formatInt } from "@/lib/format";

/** The chart drawer entries that show one value for each analyzed save. */
export type BySaveViz = "dev-by-save" | "army-by-save" | "manpower-by-save" | "world-dev-by-save";

export type BySaveFigure = {
  title: string;
  /** The axis title, with the unit. */
  axis: string;
  unit: string;
  /** The country metric, or none for the world total. */
  metric: CountryMetric | null;
  /** The value as the viewer shows it. */
  format: (value: number) => string;
  /** The value with its unit, for hover text. */
  describe: (value: number) => string;
};

const points = (value: number) => formatInt(value);
const thousands = (value: number) => `${formatInt(value)}K`;

/** Each figure is a number that the viewer shows for one save, in the same unit and rounding. */
export const bySaveFigures: Record<BySaveViz, BySaveFigure> = {
  "dev-by-save": {
    title: "Development by save",
    axis: "Development, points",
    unit: "development points",
    metric: "provinceDevelopment",
    format: points,
    describe: (value) => `${points(value)} development`,
  },
  "army-by-save": {
    title: "Army size by save",
    axis: "Army size, thousands of men",
    unit: "thousands of men",
    metric: "armySize",
    format: thousands,
    describe: (value) => `${thousands(value)} men`,
  },
  "manpower-by-save": {
    title: "Max manpower by save",
    axis: "Max manpower, thousands of men",
    unit: "thousands of men",
    metric: "maxManpower",
    format: thousands,
    describe: (value) => `${thousands(value)} men`,
  },
  "world-dev-by-save": {
    title: "World development by save",
    axis: "Development, points",
    unit: "development points",
    metric: null,
    format: points,
    describe: (value) => `${points(value)} development`,
  },
};

export const bySaveVizs = Object.keys(bySaveFigures) as BySaveViz[];
