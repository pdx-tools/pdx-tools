import type { SnapshotTables } from "./analysisTypes";

/** The country columns, in the order of `eu5app::snapshot::CountryMetric`. */
export const COUNTRY_METRICS = [
  "population",
  "development",
  "wealth",
  "tax",
  "effectiveDevelopment",
  "stateCapacity",
  "births",
  "ruralPopulation",
  "urbanPopulation",
  "rgoLevels",
  "buildingLevels",
  "buildingEmployment",
  "income",
  "greatPowerRank",
] as const;
export const BREAKDOWNS = ["religions", "materials", "buildings"] as const;
export const MARKET_METRICS = ["price", "supply", "demand", "stockpile"] as const;

export type CountryMetric = (typeof COUNTRY_METRICS)[number];
export type Breakdown = (typeof BREAKDOWNS)[number];
export type MarketMetric = (typeof MARKET_METRICS)[number];

/** A missing value is null. */
export type CountryObservation = Record<CountryMetric, number | null> & {
  countryId: number;
  tag: string;
  locations: number;
  religions: Map<string, number>;
  materials: Map<string, number>;
  buildings: Map<string, number>;
  marketCenters: number[];
};
export type MarketObservation = Record<MarketMetric, number | null> & {
  center: number;
  centerName: string | null;
  good: string;
};

const MISSING = 0xffffffff;
const value = (x: number) => (Number.isNaN(x) ? null : x);

/** Refuse tables that do not have a value for each row, before the store keeps them. */
export function validateTables(t: SnapshotTables) {
  const same = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((x, i) => x === b[i]);
  if (!same(t.countryMetrics, COUNTRY_METRICS) || !same(t.marketMetrics, MARKET_METRICS))
    throw Error("Snapshot tables are from a different version");
  const countries = t.countryIds.length;
  const markets = t.marketCenters.length;
  if (
    t.countryTags.length !== countries ||
    t.countryLocations.length !== countries ||
    t.countryValues.length !== countries * COUNTRY_METRICS.length ||
    t.breakdownOffsets.length !== countries * BREAKDOWNS.length + 1 ||
    t.breakdownOffsets[t.breakdownOffsets.length - 1] !== t.breakdownValues.length ||
    t.breakdownKeys.length !== t.breakdownValues.length ||
    t.countryMarketOffsets.length !== countries + 1 ||
    t.countryMarketOffsets[countries] !== t.countryMarkets.length ||
    t.marketCenterNames.length !== markets ||
    t.marketGoods.length !== markets ||
    t.marketValues.length !== markets * MARKET_METRICS.length
  )
    throw Error("Incomplete snapshot tables");
  const strings = t.strings.length;
  const inRange = (keys: Uint32Array, missing = false) =>
    keys.every((key) => key < strings || (missing && key === MISSING));
  if (
    !inRange(t.countryTags) ||
    !inRange(t.breakdownKeys) ||
    !inRange(t.marketGoods) ||
    !inRange(t.marketCenterNames, true)
  )
    throw Error("Invalid snapshot table keys");
  for (let i = 1; i < countries; i++)
    if (t.countryIds[i - 1] >= t.countryIds[i]) throw Error("Snapshot countries are not sorted");
}

/** The row of a full country ID, or -1. */
export function countryRow(t: SnapshotTables, countryId: number) {
  let low = 0;
  let high = t.countryIds.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const id = t.countryIds[mid];
    if (id === countryId) return mid;
    if (id < countryId) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

export function countryAt(t: SnapshotTables, row: number): CountryObservation {
  const width = COUNTRY_METRICS.length;
  const country = {
    countryId: t.countryIds[row],
    tag: t.strings[t.countryTags[row]],
    locations: t.countryLocations[row],
    marketCenters: Array.from(
      t.countryMarkets.subarray(t.countryMarketOffsets[row], t.countryMarketOffsets[row + 1]),
    ),
  } as CountryObservation;
  COUNTRY_METRICS.forEach((metric, column) => {
    country[metric] = value(t.countryValues[row * width + column]);
  });
  BREAKDOWNS.forEach((breakdown, kind) => {
    const at = row * BREAKDOWNS.length + kind;
    const totals = new Map<string, number>();
    for (let i = t.breakdownOffsets[at]; i < t.breakdownOffsets[at + 1]; i++)
      totals.set(t.strings[t.breakdownKeys[i]], t.breakdownValues[i]);
    country[breakdown] = totals;
  });
  return country;
}

/** The sum of all countries. It has no great power rank. */
export function worldAt(t: SnapshotTables): CountryObservation {
  const world: CountryObservation = {
    countryId: MISSING,
    tag: "",
    locations: 0,
    religions: new Map(),
    materials: new Map(),
    buildings: new Map(),
    marketCenters: [],
    ...(Object.fromEntries(COUNTRY_METRICS.map((metric) => [metric, 0])) as Record<
      CountryMetric,
      number | null
    >),
  };
  world.greatPowerRank = null;
  const width = COUNTRY_METRICS.length;
  for (let row = 0; row < t.countryIds.length; row++) {
    world.locations += t.countryLocations[row];
    COUNTRY_METRICS.forEach((metric, column) => {
      const x = t.countryValues[row * width + column];
      if (metric !== "greatPowerRank" && !Number.isNaN(x)) world[metric] = world[metric]! + x;
    });
  }
  BREAKDOWNS.forEach((breakdown, kind) => {
    const totals = world[breakdown];
    for (let row = 0; row < t.countryIds.length; row++) {
      const at = row * BREAKDOWNS.length + kind;
      for (let i = t.breakdownOffsets[at]; i < t.breakdownOffsets[at + 1]; i++) {
        const key = t.strings[t.breakdownKeys[i]];
        totals.set(key, (totals.get(key) ?? 0) + t.breakdownValues[i]);
      }
    }
  });
  return world;
}

export function marketAt(t: SnapshotTables, row: number): MarketObservation {
  const name = t.marketCenterNames[row];
  const market = {
    center: t.marketCenters[row],
    centerName: name === MISSING ? null : t.strings[name],
    good: t.strings[t.marketGoods[row]],
  } as MarketObservation;
  MARKET_METRICS.forEach((metric, column) => {
    market[metric] = value(t.marketValues[row * MARKET_METRICS.length + column]);
  });
  return market;
}

/** The row of the market at a center location for a good, or -1. */
export function marketRow(t: SnapshotTables, center: number, good: string) {
  const key = t.strings.indexOf(good);
  if (key < 0) return -1;
  for (let row = 0; row < t.marketCenters.length; row++)
    if (t.marketCenters[row] === center && t.marketGoods[row] === key) return row;
  return -1;
}
