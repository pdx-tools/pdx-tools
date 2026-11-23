import type { CountryMetric } from "@/wasm/wasm_eu4";
import { formatInt } from "@/lib/format";

/** A figure that the campaign chart plots: one value for each save. */
export type FigureId =
  | "development"
  | "autonomy-development"
  | "army"
  | "max-manpower"
  | "world-development"
  | "world-autonomy-development"
  | "mana-use"
  | "mana-country"
  | "mana-banked";

/** The rows of the figure picker. */
export type FamilyId = "development" | "army" | "manpower" | "mana" | "world";

/** What a figure plots: a country metric, the world total, or a mana view. */
export type FigureKind =
  | { kind: "country"; metric: CountryMetric }
  | { kind: "world"; measure: "raw" | "autonomy" }
  | { kind: "mana"; view: "use" | "country" | "banked" };

/** The mana views. */
export type ManaOption = Extract<FigureKind, { kind: "mana" }>["view"];

export type CampaignFigure = FigureKind & {
  /** The figure's segment within its family. */
  option: string;
  title: string;
  unit: string;
  /** The value as the viewer shows it. */
  format: (value: number) => string;
  /** With decimals, for figures that would otherwise read alike. */
  fine: (value: number, digits: number) => string;
  /** A round value on the axis, with the axis step, so ticks read apart. */
  tick: (value: number, step: number) => string;
};

// A value just under zero rounds to 0, never "-0".
const points = (value: number) => {
  const text = formatInt(value);
  return /^-0$/.test(text) ? "0" : text;
};
// Zero reads as on the axis, and a few men never read as none.
const thousands = (value: number) => {
  if (value === 0) return "0";
  const size = Math.abs(value);
  if (size < 0.05) return `${value.toLocaleString("en-US", { maximumSignificantDigits: 1 })}K`;
  if (size < 0.95)
    return `${value.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}K`;
  return `${formatInt(value)}K`;
};
const decimals = (value: number, digits: number) =>
  value.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    signDisplay: "negative",
  });
const finePoints = (value: number, digits: number) => decimals(value, digits);
const fineThousands = (value: number, digits: number) =>
  value === 0 ? "0" : `${decimals(value, digits)}K`;
/** The decimals that show every multiple of an axis step exactly, at most three. */
const stepDigits = (step: number) =>
  [0, 1, 2, 3].find((d) => Math.abs(step * 10 ** d - Math.round(step * 10 ** d)) < 1e-6) ?? 3;
const tickOf = (unit: string) => (value: number, step: number) =>
  // Zero is zero in any unit.
  value === 0
    ? "0"
    : `${value.toLocaleString("en-US", { maximumFractionDigits: stepDigits(step), minimumFractionDigits: 0 })}${unit}`;

const plain = { format: points, fine: finePoints, tick: tickOf("") };
const mana = { kind: "mana" as const, unit: "mana points", ...plain };
const men = { unit: "thousands of men", format: thousands, fine: fineThousands, tick: tickOf("K") };

/** Each figure is a number that the viewer shows for one save, in the same unit and rounding. */
export const campaignFigures: Record<FigureId, CampaignFigure> = {
  development: {
    option: "Raw",
    title: "Development",
    unit: "development points",
    kind: "country",
    metric: "provinceDevelopment",
    ...plain,
  },
  "autonomy-development": {
    option: "Autonomy-adjusted",
    title: "Autonomy-adjusted development",
    unit: "development points",
    kind: "country",
    metric: "autonomyDevelopment",
    ...plain,
  },
  army: { option: "Army size", title: "Army size", kind: "country", metric: "armySize", ...men },
  "max-manpower": {
    option: "Max manpower",
    title: "Max manpower",
    kind: "country",
    metric: "maxManpower",
    ...men,
  },
  "mana-use": { option: "By use", title: "Mana by use", view: "use", ...mana },
  "mana-country": { option: "By country", title: "Mana spent", view: "country", ...mana },
  "mana-banked": { option: "Banked", title: "Banked mana", view: "banked", ...mana },
  "world-development": {
    option: "Raw",
    title: "World development",
    unit: "development points",
    kind: "world",
    measure: "raw",
    ...plain,
  },
  "world-autonomy-development": {
    option: "Autonomy-adjusted",
    title: "World autonomy-adjusted development",
    unit: "development points",
    kind: "world",
    measure: "autonomy",
    ...plain,
  },
};

export type Family = {
  id: FamilyId;
  title: string;
  figures: readonly FigureId[];
};

/** The families in the picker's order, each with its figures in segment order. */
export const families: readonly Family[] = [
  { id: "development", title: "Development", figures: ["development", "autonomy-development"] },
  { id: "army", title: "Army size", figures: ["army"] },
  { id: "manpower", title: "Max manpower", figures: ["max-manpower"] },
  {
    id: "world",
    title: "World development",
    figures: ["world-development", "world-autonomy-development"],
  },
  { id: "mana", title: "Mana", figures: ["mana-use", "mana-country", "mana-banked"] },
];

/** Every figure, in picker order. */
export const builtFigures = families.flatMap((x) => x.figures);

export const familyOf = (id: FamilyId) => families.find((x) => x.id === id)!;

/** The options of a family, listed under its name in the picker. */
export const familyHint = (family: Family) =>
  family.figures.length > 1 ? family.figures.map((x) => campaignFigures[x].option).join(" · ") : "";

/** The figure that a family shows: the one last chosen in it, else its first. */
export function figureOf(family: FamilyId, chosen: Partial<Record<FamilyId, FigureId>>): FigureId {
  const figures = familyOf(family).figures;
  const last = chosen[family];
  return last && figures.includes(last) ? last : figures[0];
}

/** The end of the CSV's file name: the family, and the option where it has several. */
export function csvSuffix(family: FamilyId, figure: FigureId) {
  const options = familyOf(family).figures;
  const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const option = options.length > 1 ? `-${slug(campaignFigures[figure].option)}` : "";
  return `-campaign-${family}${option}.csv`;
}
