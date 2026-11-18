import type { AnalyticsObservation, MarketObservation } from "@/wasm/wasm_eu5";

export const worldHistoryLabel = "World · owned locations";

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

export function weightedMarketPrice(
  observations: (Pick<MarketObservation, "price" | "totalTaken"> | undefined)[],
) {
  let weightedPrice = 0;
  let volume = 0;
  for (const observation of observations) {
    const price = observation?.price;
    const taken = observation?.totalTaken;
    if (
      price === undefined ||
      taken === undefined ||
      !Number.isFinite(price) ||
      !Number.isFinite(taken) ||
      taken <= 0
    ) {
      continue;
    }
    weightedPrice += price * taken;
    volume += taken;
  }
  const price = weightedPrice / volume;
  return Number.isFinite(price) ? price : null;
}
