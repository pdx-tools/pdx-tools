import { describe, expect, it } from "vitest";
import type { CountrySearchEntry, UiCountryId } from "@/wasm/wasm_eu5";
import { findCarriedCountry } from "./carriedCountry";

const id = (value: number) => value as UiCountryId;
const country = (key: number, value: number, tag: string, landed = true): CountrySearchEntry => ({
  country: { key, name: tag },
  id: id(value),
  tag,
  capital: 1,
  landed,
});

describe("carried country lookup", () => {
  it("follows a country that changes its tag", () => {
    // NTC forms YMT and keeps its ID. The old YMT gets a placeholder tag.
    const countries = [country(5, 611, "YMT"), country(6, 613, "AAA64", false)];
    expect(findCarriedCountry(countries, { id: id(611), tag: "NTC" })).toBe(5);
  });

  it("uses the new holder of the tag when the old country has no land", () => {
    // The old POR keeps its ID and its capital, but it owns no locations.
    const countries = [country(3, 1259, "AAA26", false), country(9, 16779617, "POR")];
    expect(findCarriedCountry(countries, { id: id(1259), tag: "POR" })).toBe(9);
  });

  it("uses the new holder of the tag when the ID is gone", () => {
    const countries = [country(9, 16779617, "POR")];
    expect(findCarriedCountry(countries, { id: id(1259), tag: "POR" })).toBe(9);
  });

  it("keeps a landed country by its ID before a landed holder of its old tag", () => {
    const countries = [country(5, 611, "YMT"), country(6, 2000, "NTC")];
    expect(findCarriedCountry(countries, { id: id(611), tag: "NTC" })).toBe(5);
  });

  it("uses the ID when no candidate has land", () => {
    const countries = [country(3, 1259, "AAA26", false), country(9, 16779617, "POR", false)];
    expect(findCarriedCountry(countries, { id: id(1259), tag: "POR" })).toBe(3);
  });

  it("finds nothing when the ID and the tag are both gone", () => {
    expect(findCarriedCountry([country(5, 611, "YMT")], { id: id(1259), tag: "POR" })).toBeNull();
  });

  it("accepts a legacy carry with only a tag", () => {
    const countries = [country(3, 50, "POR", false), country(9, 2375, "POR")];
    expect(findCarriedCountry(countries, { tag: "POR" })).toBe(9);
  });
});
