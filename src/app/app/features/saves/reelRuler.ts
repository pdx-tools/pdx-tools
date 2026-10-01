/*
 * The ruler under a campaign reel. Each save has a stop, a place on the
 * ruler from 0 to 1. A reel position is a frame index with a fraction: 2.5
 * is halfway from the third save to the fourth.
 */

/** `1444-11-11` → years as a number, so that the ruler can space saves by game time. */
function gameYears(date: string): number {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  return y + (m - 1) / 12 + (d - 1) / 365;
}

/**
 * The smallest gap between two stops, as a part of the ruler. Two saves with
 * the same date (two uploads of one autosave, or two players in one
 * multiplayer game) must not share a tick: a reader must see both, and a
 * click on the ruler must reach both.
 */
export function minStopGap(count: number): number {
  return count > 1 ? Math.min(0.015, 0.5 / (count - 1)) : 0;
}

/**
 * The stop of each save, by game date, with the dates in order. Saves too
 * close together are pushed apart to `minStopGap`, and the result is scaled
 * back to end at 1.
 */
export function rulerStops(dates: readonly string[]): number[] {
  if (dates.length <= 1) {
    return dates.map(() => 0);
  }

  const years = dates.map(gameYears);
  const first = years[0];
  const span = years[years.length - 1] - first;
  const gap = minStopGap(dates.length);
  const stops: number[] = [];
  for (let i = 0; i < years.length; i++) {
    const raw = span > 0 ? (years[i] - first) / span : 0;
    stops.push(i === 0 ? 0 : Math.max(raw, stops[i - 1] + gap));
  }

  const end = stops[stops.length - 1];
  return end > 0 ? stops.map((x) => x / end) : stops;
}

/** A reel position as a place on the ruler. */
export function positionToStop(stops: readonly number[], position: number): number {
  const lo = Math.min(Math.floor(position), stops.length - 1);
  const hi = Math.min(lo + 1, stops.length - 1);
  return stops[lo] + (position - lo) * (stops[hi] - stops[lo]);
}

/** A place on the ruler as a reel position. The inverse of `positionToStop`. */
export function stopToPosition(stops: readonly number[], stop: number): number {
  for (let i = 0; i < stops.length - 1; i++) {
    if (stop <= stops[i + 1]) {
      const width = stops[i + 1] - stops[i];
      return width > 0 ? i + Math.max(0, stop - stops[i]) / width : i;
    }
  }
  return Math.max(0, stops.length - 1);
}

/**
 * The labels at the ends of the ruler: the years, or the dates when the
 * campaign starts and ends in one year.
 */
export function rulerEnds(
  first: string,
  last: string,
  formatDate: (date: string) => string,
): [string, string] {
  const year = (date: string) => date.split("-", 1)[0];
  return year(first) === year(last)
    ? [formatDate(first), formatDate(last)]
    : [year(first), year(last)];
}
