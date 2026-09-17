import { formatFloat, formatInt } from "@/lib/format";

export function formatRate(value: number, digits = 2) {
  return `${formatFloat(value * 100, digits)}%`;
}

/** People counts at readout precision: 356.8M, 1.25M, 12.5K, 840. */
export function formatPeople(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "\u2212" : "";
  const compact = (v: number, digits: number, suffix: string) => {
    const rounded = Number(v.toFixed(digits));
    const decimals = (String(rounded).split(".")[1] ?? "").length;
    return `${sign}${decimals === 0 ? formatInt(rounded) : formatFloat(rounded, decimals)}${suffix}`;
  };
  if (abs >= 10_000_000) return compact(abs / 1_000_000, 1, "M");
  if (abs >= 1_000_000) return compact(abs / 1_000_000, 2, "M");
  if (abs >= 1_000) return compact(abs / 1_000, 1, "K");
  return `${sign}${formatInt(Math.round(abs))}`;
}

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
    `Births: ${formatPeople(c.birthsPerYear)}/yr`,
    `Locations: ${formatInt(c.locationCount)}`,
  ];
}
