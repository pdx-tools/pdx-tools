import { dayNumber, formatLongDate } from "@/features/timeline/date";
import type { DateComponents } from "@/features/timeline/date";
import type { PopulationHistory } from "@/wasm/wasm_eu5";

const DAYS_PER_YEAR = 365;

/** A date as a year and its fraction, for a chart's axis of years */
export function yearOfDate(date: DateComponents): number {
  return dayNumber(date) / DAYS_PER_YEAR;
}

/** The year of the first sample of a yearly record */
export function firstYear({ lastYear, people }: PopulationHistory): number {
  return lastYear - people.length + 1;
}

/**
 * A yearly record as [year, value] points that end on the save date. The game
 * writes a sample on the first day of each year. The last point is `now`, the
 * figure that the tables show, so the chart ends on that figure. On the first
 * day of a year, `now` replaces the sample of that year.
 */
export function pointsToSave(
  record: PopulationHistory,
  save: DateComponents,
  now: number,
): [number, number][] {
  const first = firstYear(record);
  const end = yearOfDate(save);
  const points = record.people
    .map((value, i): [number, number] => [first + i, value])
    .filter(([year]) => year < end);
  points.push([end, now]);
  return points;
}

/** The name of a point from `pointsToSave`: its year, or the save date for the last point */
export function pointLabel(x: number, save: DateComponents): string {
  return x === yearOfDate(save) ? formatLongDate(save) : String(x);
}

const YEAR_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];

/**
 * The round years from `first` to `last`, such as 1350, 1400 and 1450, with
 * `maxLabels` as the limit. A history starts in 1337, so ticks counted from
 * an end of the axis are not round.
 */
export function roundYears(first: number, last: number, maxLabels = 6): number[] {
  const span = last - first;
  const step = YEAR_STEPS.find((s) => span / s <= maxLabels) ?? YEAR_STEPS.at(-1)!;
  const years: number[] = [];
  for (let year = Math.ceil(first / step) * step; year <= last; year += step) {
    years.push(year);
  }
  return years;
}

/** The x axis of a yearly chart from `first` to `last`, with its ticks on round years */
export function yearAxis(first: number, last: number) {
  const years = roundYears(first, last);
  return {
    type: "value" as const,
    min: first,
    max: last,
    axisLabel: { customValues: years, formatter: (year: number) => String(year) },
    axisTick: { customValues: years },
  };
}
