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

/**
 * Where a rank stands on a track of a cohort, from 0 at the last rank to 1 at the
 * first. The scale is logarithmic, because a reader tells #1 from #5 and does not
 * tell #301 from #305. On a linear track the top ranks stand on one pixel.
 */
export function rankPosition(rank: number, cohort: number): number {
  return cohort > 1 ? 1 - Math.log(Math.max(1, rank)) / Math.log(cohort) : 1;
}
