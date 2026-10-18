import type { MapMode } from "@/wasm/wasm_eu5";
import type { Breakdown, CountryObservation } from "./snapshotTables";

export type CountryChart = {
  title: string;
  unit: string;
  value: (c: CountryObservation) => number | null;
};

const ratio = (n: number | null, d: number | null) =>
  n == null || d == null || d <= 0 ? null : (100 * n) / d;
const difference = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b);
const perLocation = (value: number | null, c: CountryObservation) =>
  value == null || !c.locations ? null : value / c.locations;

const population: CountryChart = {
  title: "Population",
  unit: "People",
  value: (c) => c.population,
};
const effective: CountryChart = {
  title: "Effective development",
  unit: "Development",
  value: (c) => c.effectiveDevelopment,
};
const realization: CountryChart = {
  title: "Development weighted control",
  unit: "%",
  value: (c) => ratio(c.effectiveDevelopment, c.development),
};

/** The country charts of each map mode. */
export const COUNTRY_CHARTS: Record<MapMode, CountryChart[]> = {
  political: [
    population,
    {
      title: "Active state capacity",
      unit: "Population × effective development",
      value: (c) => c.stateCapacity,
    },
    { title: "Monthly tax and trade income", unit: "Ducats", value: (c) => c.income },
  ],
  control: [
    realization,
    {
      title: "Development lost to control",
      unit: "Development",
      value: (c) => difference(c.development, c.effectiveDevelopment),
    },
  ],
  development: [
    { title: "Total development", unit: "Development", value: (c) => c.development },
    {
      title: "Average development per location",
      unit: "Development / location",
      value: (c) => perLocation(c.development, c),
    },
  ],
  stateEfficacy: [effective, realization],
  wealth: [
    { title: "Total wealth", unit: "Potential tax base", value: (c) => c.wealth },
    {
      title: "Average wealth per location",
      unit: "Potential tax base / location",
      value: (c) => perLocation(c.wealth, c),
    },
  ],
  unrealizedTaxBase: [
    {
      title: "Tax base gap",
      unit: "Potential − realized tax base",
      value: (c) => difference(c.wealth, c.tax),
    },
    { title: "Tax realization", unit: "%", value: (c) => ratio(c.tax, c.wealth) },
  ],
  population: [
    population,
    {
      title: "Urbanization",
      unit: "% in towns, cities and megalopolises",
      value: (c) => ratio(c.urbanPopulation, c.population),
    },
  ],
  populationGrowth: [
    { title: "Yearly births", unit: "People / year", value: (c) => c.births },
    {
      title: "Yearly birth rate",
      unit: "% · without migration and deaths",
      value: (c) => ratio(c.births, c.population),
    },
  ],
  buildingLevels: [
    { title: "Building levels", unit: "Levels", value: (c) => c.buildingLevels },
    { title: "Building employment", unit: "People", value: (c) => c.buildingEmployment },
  ],
  religion: [population],
  rgoLevel: [{ title: "RGO levels", unit: "Levels", value: (c) => c.rgoLevels }],
  markets: [],
};

/** The composition chart of a map mode, if it has one. */
export const BREAKDOWN_CHARTS: Partial<
  Record<MapMode, { breakdown: Breakdown; title: string; unit: string }>
> = {
  religion: {
    breakdown: "religions",
    title: "Population by religion",
    unit: "People · six largest religions",
  },
  buildingLevels: {
    breakdown: "buildings",
    title: "Building types",
    unit: "Levels · six largest types",
  },
  rgoLevel: {
    breakdown: "materials",
    title: "Raw materials",
    unit: "RGO levels · six largest materials",
  },
};

export const GREAT_POWER_RANK: CountryChart = {
  title: "Great power rank",
  unit: "1 is the highest rank",
  value: (c) => c.greatPowerRank,
};

/** Game keys such as "rice_paddy" as words. */
export const humanize = (key: string) =>
  key.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
