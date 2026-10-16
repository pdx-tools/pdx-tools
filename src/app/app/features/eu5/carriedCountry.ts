import type { UiCountryId } from "@/wasm/wasm_eu5";

export type CountryIdentity = { id: UiCountryId; tag: string };

/**
 * A country keeps its ID when it changes its tag. When a country dies, a
 * different country can take its tag. Thus, a landed country has priority.
 */
export function findCarriedCountry(
  countries: readonly { id: UiCountryId; tag: string; landed: boolean; country: { key: number } }[],
  { id, tag }: CountryIdentity,
): number | null {
  const match =
    countries.find((c) => c.id === id && c.landed) ??
    countries.find((c) => c.tag === tag && c.landed) ??
    countries.find((c) => c.id === id) ??
    countries.find((c) => c.tag === tag);
  return match?.country.key ?? null;
}
