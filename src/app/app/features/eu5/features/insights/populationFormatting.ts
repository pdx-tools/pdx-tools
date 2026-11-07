import { formatInt, formatRate } from "@/lib/format";

/** Years until the population doubles at a constant yearly rate. */
export function doublingYears(rate: number): number {
  return Math.LN2 / rate;
}

export function formatDoubling(rate: number): string {
  if (rate <= 0) return "not growing";
  const years = doublingYears(rate);
  return years > 999 ? "doubles in >999 yr" : `doubles in ${formatInt(Math.round(years))} yr`;
}

export function formatDoublingShort(rate: number): string {
  if (rate <= 0) return "not growing";
  const years = doublingYears(rate);
  return years > 999 ? ">999 yr to double" : `${formatInt(Math.round(years))} yr to double`;
}

/** The country lines both panels' tooltips share, after the name. */
export function countryGrowthLines(c: {
  totalPopulation: number;
  growthRate: number;
  birthsPerYear: number;
  locationCount: number;
}): string[] {
  return [
    `Population: ${formatInt(c.totalPopulation)}`,
    `Growth: ${formatRate(c.growthRate)}/yr, ${formatDoubling(c.growthRate)}`,
    `Births: ${formatInt(c.birthsPerYear)}/yr`,
    `Locations: ${formatInt(c.locationCount)}`,
  ];
}
