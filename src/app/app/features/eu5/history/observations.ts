import type { AnalyticsObservation } from "@/wasm/wasm_eu5";

export type HistoryObservation = AnalyticsObservation & {
  campaignId: string;
  contentHash: string;
};

export function countryObservation(snapshot: AnalyticsObservation, countryId: number | undefined) {
  // The query returns only the selected country or the world aggregate.
  const country = snapshot.countries[0];
  return country?.countryId === (countryId ?? 0xffffffff) ? country : undefined;
}

export function marketObservation(snapshot: AnalyticsObservation, center: number, good: string) {
  return snapshot.markets.find((market) => market.center === center && market.good === good);
}
