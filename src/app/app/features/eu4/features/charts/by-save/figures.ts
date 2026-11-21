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
  /** With decimals, for figures that would otherwise read alike. */
  fine: (value: number, digits: number) => string;
  /** A round value on the axis, with the axis step, so ticks read apart. */
  tick: (value: number, step: number) => string;
};

const points = (value: number) => formatInt(value);
const thousands = (value: number) => `${formatInt(value)}K`;
const decimals = (value: number, digits: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
const finePoints = (value: number, digits: number) => decimals(value, digits);
const fineThousands = (value: number, digits: number) => `${decimals(value, digits)}K`;
/** The decimals that show every multiple of an axis step exactly, at most three. */
const stepDigits = (step: number) =>
  [0, 1, 2, 3].find((d) => Math.abs(step * 10 ** d - Math.round(step * 10 ** d)) < 1e-6) ?? 3;
const tickOf = (unit: string) => (value: number, step: number) =>
  `${value.toLocaleString("en-US", { maximumFractionDigits: stepDigits(step), minimumFractionDigits: 0 })}${unit}`;

/** Each figure is a number that the viewer shows for one save, in the same unit and rounding. */
export const bySaveFigures: Record<BySaveViz, BySaveFigure> = {
  "dev-by-save": {
    title: "Development by save",
    unit: "development points",
    metric: "provinceDevelopment",
    format: points,
    fine: finePoints,
    tick: tickOf(""),
  },
  "army-by-save": {
    title: "Army size by save",
    unit: "thousands of men",
    metric: "armySize",
    format: thousands,
    fine: fineThousands,
    tick: tickOf("K"),
  },
  "manpower-by-save": {
    title: "Max manpower by save",
    unit: "thousands of men",
    metric: "maxManpower",
    format: thousands,
    fine: fineThousands,
    tick: tickOf("K"),
  },
  "world-dev-by-save": {
    title: "World development by save",
    unit: "development points",
    metric: null,
    format: points,
    fine: finePoints,
    tick: tickOf(""),
  },
};

export const bySaveVizs = Object.keys(bySaveFigures) as BySaveViz[];
