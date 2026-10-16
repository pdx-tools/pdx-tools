import { expect, it } from "vitest";
import { packOverviews, overview, analyticalBuffers } from "./packedOverview";
import type { OverviewData } from "@/wasm/wasm_eu5";
it("packs nested rows without changing values, missing fields or empty arrays", () => {
  const control = {
    scope: { value: 0.12345678912345678, missing: undefined, nullValue: null },
    barCountries: [
      {
        country: { country: { key: 12, name: "England" }, isPlayer: true },
        bands: [{ band: "great", development: 123.45678912345679 }],
      },
      { country: { country: { key: 15, name: "France" }, isPlayer: false }, bands: [] },
    ],
    scatterCountries: [],
    topLocations: [],
  };
  const packed = packOverviews({ control } as unknown as OverviewData);
  expect(overview(structuredClone(packed), "control")).toEqual(control);
  expect(analyticalBuffers(packed).length).toBeGreaterThan(1);
});
it("reconstructs exact concentration curves from only sorted source values", () => {
  let cumulativeValue = 0;
  const values = [0.12345678912345678, 0.07, 0.00001],
    total = values.reduce((a, b) => a + b, 0);
  const concentration = values.map((value, index) => {
    cumulativeValue += value;
    return {
      locationRank: index + 1,
      locationCount: values.length,
      value,
      cumulativeValue,
      share: cumulativeValue / total,
    };
  });
  const data = {
    wealth: { concentration },
    population: { concentration: [] },
  } as unknown as OverviewData;
  const packed = packOverviews(data);
  expect(overview(packed, "wealth")).toEqual(data.wealth);
  expect(overview(packed, "population")).toEqual(data.population);
  expect(analyticalBuffers(packed).some((buffer) => buffer.byteLength === values.length * 8)).toBe(
    true,
  );
});
it("shares country, market and localized references without losing observation metadata or precision", () => {
  const country = {
    country: { key: 7, name: "Renamed country" },
    anchorLocationIdx: 4000000000,
    tag: "NEW",
    flag: undefined,
    colorHex: "#123456",
    isPlayer: false,
  };
  const market = {
    market: { key: 99, name: "London" },
    anchorLocationIdx: 42,
    colorHex: "#abcdef",
  };
  const data = {
    markets: {
      rows: Array.from({ length: 30 }, (_, i) => ({
        country,
        market,
        good: { key: "wheat", name: "Wheat" },
        count: i,
        value: i + 0.12345678912345678,
        negativeZero: -0,
      })),
    },
  } as unknown as OverviewData;
  const packed = packOverviews(data);
  expect(overview(structuredClone(packed), "markets")).toEqual(data.markets);
});

it("keeps distinct localized labels whose text contains delimiters", () => {
  const markets = {
    labels: [
      { key: "a:b", name: "c", colorHex: "#fff" },
      { key: "a", name: "b:c", colorHex: "#fff" },
    ],
  };
  expect(overview(packOverviews({ markets } as unknown as OverviewData), "markets")).toEqual(
    markets,
  );
});
