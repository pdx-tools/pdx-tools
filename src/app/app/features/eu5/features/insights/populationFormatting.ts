import { formatInt } from "@/lib/format";
import { formatExact, formatRate } from "../../numberFormatting";

/** Years until the population doubles at a constant yearly rate. */
export function doublingYears(rate: number): number {
  return Math.LN2 / rate;
}

/** The doubling time as a figure and its label, such as "132 yr" "to double" */
export function doublingFigure(rate: number): { value: string; label?: string } {
  if (rate <= 0) return { value: "not growing" };
  const years = doublingYears(rate);
  const value = years > 999 ? ">999 yr" : `${formatInt(Math.round(years))} yr`;
  return { value, label: "to double" };
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
    `Growth: ${formatRate(c.growthRate)}/yr, ${formatDoublingShort(c.growthRate)}`,
    `Births: ${formatExact(c.birthsPerYear)}/yr`,
    `Locations: ${formatInt(c.locationCount)}`,
  ];
}
