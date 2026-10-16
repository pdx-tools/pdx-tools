import type { Snapshot } from "./types";
export const countryObservation = (snapshot: Snapshot, key: string) =>
  snapshot.countries.find((country) =>
    key === "world" ? country.tag === "world" : key === `id:${country.countryId}`,
  );
export const marketObservation = (snapshot: Snapshot, center: number, good: string) =>
  snapshot.markets.find((market) => market.center === center && market.good === good);
