import { StringTable } from "./stringTable";
import type { SaveSnapshot } from "@/wasm/wasm_eu5";
import type { Snapshot } from "./types";

type Country = SaveSnapshot["countries"][number];
type Market = SaveSnapshot["markets"][number];
const numericFields = [
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
const breakdowns = ["religions", "materials", "buildings"] as const;
const marketFields = ["price", "supply", "demand", "stockpile"] as const;
const missing = 0xffffffff;
export type PackedSnapshot = Omit<Snapshot, "countries" | "markets"> & {
  strings: string[];
  countryValues: Float64Array<ArrayBuffer>;
  countryIds: Uint32Array<ArrayBuffer>;
  countryOffsets: Uint32Array<ArrayBuffer>;
  breakdownKeys: Uint32Array<ArrayBuffer>;
  breakdownValues: Float64Array<ArrayBuffer>;
  countryMarkets: Uint32Array<ArrayBuffer>;
  marketValues: Float64Array<ArrayBuffer>;
  marketIds: Uint32Array<ArrayBuffer>;
  marketMetadata: Uint32Array<ArrayBuffer>;
};
/** Charts keep f64 values; only dictionary IDs and offsets use integer columns. */
export function packSnapshot(snapshot: Snapshot): PackedSnapshot {
  const { countries = [], markets = [], ...metadata } = snapshot;
  const strings = new StringTable();
  const countryValues = new Float64Array(countries.length * numericFields.length);
  const countryIds = new Uint32Array(countries.length * 3);
  const countryOffsets = new Uint32Array(countries.length * 8);
  const keys: number[] = [],
    values: number[] = [],
    centers: number[] = [];
  countries.forEach((country, index) => {
    numericFields.forEach((field, column) => {
      countryValues[index * numericFields.length + column] = country[field] ?? NaN;
    });
    countryIds.set([strings.intern(country.tag), country.locations, country.countryId], index * 3);
    breakdowns.forEach((field, column) => {
      const start = keys.length;
      for (const [name, value] of country[field] instanceof Map
        ? country[field].entries()
        : Object.entries(country[field] as unknown as Record<string, number>)) {
        keys.push(strings.intern(name));
        values.push(value);
      }
      countryOffsets.set([start, keys.length - start], index * 8 + column * 2);
    });
    countryOffsets.set([centers.length, (country.marketCenters ?? []).length], index * 8 + 6);
    centers.push(...(country.marketCenters ?? []));
  });
  const marketValues = new Float64Array(markets.length * 4),
    marketIds = new Uint32Array(markets.length * 2);
  const marketIndex = new Map<number, number>(),
    marketMetadata: number[] = [];
  markets.forEach((market, index) => {
    let slot = marketIndex.get(market.marketId);
    if (slot === undefined) {
      slot = marketIndex.size;
      marketIndex.set(market.marketId, slot);
      marketMetadata.push(
        market.marketId,
        market.center,
        market.centerName == null ? missing : strings.intern(market.centerName),
      );
    }
    marketIds.set([slot, strings.intern(market.good)], index * 2);
    marketFields.forEach((field, column) => {
      marketValues[index * 4 + column] = market[field] ?? NaN;
    });
  });
  return {
    ...metadata,
    strings: strings.values,
    countryValues,
    countryIds,
    countryOffsets,
    breakdownKeys: Uint32Array.from(keys),
    breakdownValues: Float64Array.from(values),
    countryMarkets: Uint32Array.from(centers),
    marketValues,
    marketIds,
    marketMetadata: Uint32Array.from(marketMetadata),
  };
}

function validatePackedSnapshot(p: PackedSnapshot) {
  const arrays = [
    p.countryValues,
    p.countryIds,
    p.countryOffsets,
    p.breakdownKeys,
    p.breakdownValues,
    p.countryMarkets,
    p.marketValues,
    p.marketIds,
    p.marketMetadata,
  ];
  if (
    !Array.isArray(p.strings) ||
    p.strings.some((label) => typeof label !== "string") ||
    arrays.some((a) => !ArrayBuffer.isView(a))
  )
    throw Error("Invalid observation columns");
  if (
    !(p.countryValues instanceof Float64Array) ||
    !(p.marketValues instanceof Float64Array) ||
    !(p.breakdownValues instanceof Float64Array) ||
    [
      p.countryIds,
      p.countryOffsets,
      p.breakdownKeys,
      p.countryMarkets,
      p.marketIds,
      p.marketMetadata,
    ].some((a) => !(a instanceof Uint32Array))
  )
    throw Error("Invalid observation column types");
  const n = p.countryIds.length / 3,
    m = p.marketIds.length / 2;
  if (
    !Number.isInteger(n) ||
    !Number.isInteger(m) ||
    p.countryValues.length !== n * numericFields.length ||
    p.countryOffsets.length !== n * 8 ||
    p.marketValues.length !== m * 4 ||
    p.breakdownKeys.length !== p.breakdownValues.length ||
    p.marketMetadata.length % 3 !== 0
  )
    throw Error("Invalid observation column lengths");
  for (let i = 0; i < n; i++) {
    if (p.countryIds[i * 3] >= p.strings.length) throw Error("Invalid country dictionary key");
    for (let j = 0; j < 4; j++) {
      const offset = i * 8 + j * 2,
        limit = j === 3 ? p.countryMarkets.length : p.breakdownKeys.length;
      if (p.countryOffsets[offset] + p.countryOffsets[offset + 1] > limit)
        throw Error("Invalid country breakdown range");
    }
  }
  for (const key of p.breakdownKeys)
    if (key >= p.strings.length) throw Error("Invalid breakdown dictionary key");
  for (let i = 0; i < m; i++)
    if (
      p.marketIds[i * 2] >= p.marketMetadata.length / 3 ||
      p.marketIds[i * 2 + 1] >= p.strings.length
    )
      throw Error("Invalid market dictionary key");
  for (let i = 2; i < p.marketMetadata.length; i += 3)
    if (p.marketMetadata[i] !== missing && p.marketMetadata[i] >= p.strings.length)
      throw Error("Invalid market name key");
}

/** Read only the country needed by a worker query. */
export function countryAt(p: PackedSnapshot, index: number): Country {
  const country = {
    countryId: p.countryIds[index * 3 + 2],
    tag: p.strings[p.countryIds[index * 3]],
    locations: p.countryIds[index * 3 + 1],
  } as Country;
  numericFields.forEach((field, column) => {
    const value = p.countryValues[index * numericFields.length + column];
    if (field === "greatPowerRank") country[field] = Number.isNaN(value) ? undefined : value;
    else country[field] = value;
  });
  breakdowns.forEach((field, column) => {
    const start = p.countryOffsets[index * 8 + column * 2],
      length = p.countryOffsets[index * 8 + column * 2 + 1];
    country[field] = new Map(
      Array.from({ length }, (_, offset) => [
        p.strings[p.breakdownKeys[start + offset]],
        p.breakdownValues[start + offset],
      ]),
    );
  });
  const start = p.countryOffsets[index * 8 + 6],
    length = p.countryOffsets[index * 8 + 7];
  country.marketCenters = Array.from(p.countryMarkets.subarray(start, start + length));
  return country;
}
export function marketAt(p: PackedSnapshot, index: number): Market {
  const meta = p.marketIds[index * 2] * 3,
    name = p.marketMetadata[meta + 2];
  const market = {
    marketId: p.marketMetadata[meta],
    center: p.marketMetadata[meta + 1],
    centerName: name === missing ? undefined : p.strings[name],
    good: p.strings[p.marketIds[index * 2 + 1]],
  } as Market;
  marketFields.forEach((field, column) => {
    const value = p.marketValues[index * 4 + column];
    market[field] = Number.isNaN(value) ? undefined : value;
  });
  return market;
}
export function snapshotMetadata(p: PackedSnapshot): Omit<Snapshot, "countries" | "markets"> {
  const {
    strings: _strings,
    countryValues: _cv,
    countryIds: _ci,
    countryOffsets: _co,
    breakdownKeys: _bk,
    breakdownValues: _bv,
    countryMarkets: _cm,
    marketValues: _mv,
    marketIds: _mi,
    marketMetadata: _mm,
    ...metadata
  } = p;
  return metadata;
}
/** Materialize rows only for an explicit export or parity check. */
export function snapshotView(p: PackedSnapshot): Snapshot {
  validatePackedSnapshot(p);
  return {
    ...snapshotMetadata(p),
    countries: Array.from({ length: p.countryIds.length / 3 }, (_, i) => countryAt(p, i)),
    markets: Array.from({ length: p.marketIds.length / 2 }, (_, i) => marketAt(p, i)),
  };
}
export function snapshotCountry(p: PackedSnapshot, key: string): Country | undefined {
  if (!key.startsWith("id:")) return undefined;
  const id = Number(key.slice(3));
  for (let i = 2; i < p.countryIds.length; i += 3)
    if (p.countryIds[i] === id) return countryAt(p, (i - 2) / 3);
  return undefined;
}
export function snapshotGoods(p: PackedSnapshot): string[] {
  const keys = new Set<number>();
  for (let i = 1; i < p.marketIds.length; i += 2) keys.add(p.marketIds[i]);
  return [...keys].map((key) => p.strings[key]);
}
export function validateSnapshot(p: PackedSnapshot) {
  validatePackedSnapshot(p);
}
