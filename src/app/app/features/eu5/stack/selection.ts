import { formatInt } from "@/lib/format";

/**
 * A shared rank says little when many countries share it: 461 countries can sit
 * at the cap of a metric, and each of them is "#1".
 */
export const MASS_TIE = 10;

/** A rank as a reader must take it: "=#1" when other countries share it */
export function rankLabel(rank: number, tied = 1): string {
  return `${tied > 1 ? "=" : ""}#${formatInt(rank)}`;
}

/** Where a rank stands among a cohort, from 0 for the last to 1 for the first */
export function percentileOf(rank: number, cohort: number): number {
  return cohort > 1 ? (cohort - rank) / (cohort - 1) : 1;
}
