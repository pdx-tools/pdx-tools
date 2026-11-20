import { MONTH_ABBR, dateFromDayNumber, dayNumber, formatLongDate } from "@/features/timeline/date";

/** A round number of years between ticks, for a span of years. */
function yearStep(years: number) {
  return [1, 2, 5, 10, 20, 25, 50, 100].find((step) => years / step <= 10) ?? 100;
}

/**
 * Ticks on the first day of round years, or of months when the axis holds
 * fewer than two years, such as for saves within one year. Without two month
 * starts on the axis, the first and last save days are the ticks.
 */
export function timeTicks(first: number, last: number, pad: number) {
  const min = first - pad;
  const max = last + pad;
  const inRange = (day: number) => day >= min && day <= max;
  const start = dateFromDayNumber(min);
  const end = dateFromDayNumber(max);
  const step = yearStep((max - min) / 365);
  const firstYear = Math.ceil(start.year / step) * step;
  const years = Array.from(
    { length: Math.max(0, Math.floor((end.year - firstYear) / step) + 1) },
    (_, i) => dayNumber({ year: firstYear + i * step, month: 1, day: 1 }),
  ).filter(inRange);
  if (years.length >= 2) {
    return { ticks: years, label: (day: number) => String(dateFromDayNumber(day).year) };
  }
  const span = (end.year - start.year) * 12 + end.month - start.month;
  const months = [1, 2, 3, 6].find((x) => span / x <= 8) ?? 12;
  const ticks: number[] = [];
  for (let at = start.year * 12 + start.month - 1; at <= end.year * 12 + end.month - 1; at++) {
    const month = (at % 12) + 1;
    const day = dayNumber({ year: Math.floor(at / 12), month, day: 1 });
    if ((month - 1) % months === 0 && inRange(day)) ticks.push(day);
  }
  if (ticks.length < 2) {
    return {
      ticks: [...new Set([first, last])],
      label: (day: number) => formatLongDate(dateFromDayNumber(day)),
    };
  }
  return {
    ticks,
    label: (day: number) => {
      const date = dateFromDayNumber(day);
      return `${date.year} ${MONTH_ABBR[date.month]}`;
    },
  };
}
