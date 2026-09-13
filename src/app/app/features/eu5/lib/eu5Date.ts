import type { Eu5DateComponents } from "@/wasm/wasm_eu5";

/**
 * EU5 calendar arithmetic. Every year has 365 days and no leap day, which
 * matches `Eu5Date` in Rust, so a day offset computed here lands on the same
 * date on both sides of the worker boundary.
 */

const DAYS_BEFORE_MONTH = [0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const DAYS_PER_YEAR = 365;

export const MONTH_ABBR = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Days since year 0, day 1. Only differences are meaningful. */
export function dayNumber(date: Eu5DateComponents): number {
  return date.year * DAYS_PER_YEAR + DAYS_BEFORE_MONTH[date.month] + (date.day - 1);
}

export function dateFromDayNumber(dayNumber: number): Eu5DateComponents {
  const year = Math.floor(dayNumber / DAYS_PER_YEAR);
  let remainder = dayNumber - year * DAYS_PER_YEAR;
  let month = 1;
  while (month < 12 && remainder >= DAYS_IN_MONTH[month]) {
    remainder -= DAYS_IN_MONTH[month];
    month += 1;
  }
  return { year, month, day: remainder + 1 };
}

export function daysBetween(from: Eu5DateComponents, to: Eu5DateComponents): number {
  return dayNumber(to) - dayNumber(from);
}

export function addDays(date: Eu5DateComponents, days: number): Eu5DateComponents {
  return dateFromDayNumber(dayNumber(date) + days);
}

export function addMonths(date: Eu5DateComponents, months: number): Eu5DateComponents {
  const total = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12 + 1;
  const day = Math.min(date.day, DAYS_IN_MONTH[month]);
  return { year, month, day };
}

export function addYears(date: Eu5DateComponents, years: number): Eu5DateComponents {
  const day = Math.min(date.day, DAYS_IN_MONTH[date.month]);
  return { year: date.year + years, month: date.month, day };
}

export function clampDate(
  date: Eu5DateComponents,
  start: Eu5DateComponents,
  end: Eu5DateComponents,
): Eu5DateComponents {
  const n = dayNumber(date);
  if (n <= dayNumber(start)) return start;
  if (n >= dayNumber(end)) return end;
  return date;
}

export function sameDate(a: Eu5DateComponents, b: Eu5DateComponents): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** `1346 Jun 26`: year first, the order the timeline readout shows. */
export function formatLongDate(date: Eu5DateComponents): string {
  return `${date.year} ${MONTH_ABBR[date.month]} ${date.day}`;
}
