type SaveDate = { year: number; month: number; day: number };

/** A date as a year with its fraction, for a chart's axis of years */
export function yearOfDate(date: SaveDate): number {
  return date.year + (date.month - 1) / 12 + (date.day - 1) / 360;
}

/**
 * A yearly record of the save as points to the save date. The game writes the record at
 * the start of each year. The last point is the current figure, summed from the locations,
 * so each chart ends on what the tables say. A tooltip names that point.
 */
export function pointsToSave(
  record: readonly number[],
  save: SaveDate,
  now: number,
): [number, number][] {
  const points = record.map((value, i): [number, number] => [
    save.year - record.length + 1 + i,
    value,
  ]);
  const end = yearOfDate(save);
  if (points.length > 0 && points[points.length - 1][0] === end) points.pop();
  points.push([end, now]);
  return points;
}

/** The label of a point on such a chart: its year, or the save date for the last point */
export function pointLabel(x: number, saveLabel: string): string {
  return Number.isInteger(x) ? `${x}, yearly record` : `${saveLabel}, from the locations`;
}
