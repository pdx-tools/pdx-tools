const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** `1444-11-11` → `11 November 1444`, the way the game shows a date. */
export function formatGameDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return date;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
