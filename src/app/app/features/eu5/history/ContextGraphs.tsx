import { useMemo } from "react";
import type { CountryObservation, MapMode } from "@/wasm/wasm_eu5";
import { HistoryChart } from "./HistoryChart";
import { countryObservation, worldHistoryLabel } from "./observations";
import type { HistoryObservation } from "./observations";

type Metric = { label: string; unit: string; value: (c: CountryObservation) => number | null };
const ratio = (n: number, d: number) => (d > 0 ? (100 * n) / d : null);
const population: Metric = { label: "Population", unit: "People", value: (c) => c.population };
const effective: Metric = {
  label: "Effective development",
  unit: "Development",
  value: (c) => c.effectiveDevelopment,
};
const realization: Metric = {
  label: "Development weighted control",
  unit: "%",
  value: (c) => ratio(c.effectiveDevelopment, c.development),
};
const metrics: Record<MapMode, Metric[]> = {
  political: [
    population,
    {
      label: "Active state capacity",
      unit: "Population × effective development",
      value: (c) => c.stateCapacity,
    },
    { label: "Monthly tax and trade income", unit: "Saved income", value: (c) => c.income },
  ],
  control: [
    realization,
    {
      label: "Development lost to control",
      unit: "Development",
      value: (c) => c.development - c.effectiveDevelopment,
    },
  ],
  development: [
    { label: "Total development", unit: "Development", value: (c) => c.development },
    {
      label: "Average development per location",
      unit: "Development / location",
      value: (c) => (c.locations ? c.development / c.locations : null),
    },
  ],
  stateEfficacy: [effective, realization],
  wealth: [
    { label: "Total wealth", unit: "Potential tax base", value: (c) => c.wealth },
    {
      label: "Average wealth per location",
      unit: "Potential tax base / location",
      value: (c) => (c.locations ? c.wealth / c.locations : null),
    },
  ],
  unrealizedTaxBase: [
    {
      label: "Tax base gap",
      unit: "Potential − realized tax base",
      value: (c) => c.wealth - c.tax,
    },
    { label: "Tax realization", unit: "%", value: (c) => ratio(c.tax, c.wealth) },
  ],
  population: [
    population,
    {
      label: "Urbanization",
      unit: "% living in towns, cities and megalopolises",
      value: (c) => ratio(c.urbanPopulation, c.population),
    },
  ],
  populationGrowth: [
    {
      label: "Recorded yearly births",
      unit: "People / year at the saved monthly rate",
      value: (c) => c.births,
    },
    {
      label: "Yearly reproduction rate",
      unit: "% · excludes migration and deaths",
      value: (c) => ratio(c.births, c.population),
    },
  ],
  buildingLevels: [
    {
      label: "Building levels",
      unit: "Levels · by location owner",
      value: (c) => c.buildingLevels,
    },
    { label: "Building employment", unit: "People", value: (c) => c.buildingEmployment },
  ],
  religion: [],
  rgoLevel: [{ label: "RGO levels", unit: "Levels", value: (c) => c.rgoLevels }],
  markets: [],
};
const human = (s: string) => s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function ContextGraphs({
  dates,
  mode,
  countryId,
  countryName,
  selectedId,
}: {
  dates: HistoryObservation[];
  mode: MapMode;
  countryId?: number;
  countryName?: string;
  selectedId?: string;
}) {
  const observations = useMemo(
    () => dates.map((date) => countryObservation(date, countryId)),
    [dates, countryId],
  );
  const label = countryId === undefined ? worldHistoryLabel : (countryName ?? String(countryId));
  const graphs = useMemo(() => {
    const result = metrics[mode].map((m) => ({
      title: m.label,
      unit: m.unit,
      lines: [
        {
          name: label,
          raw: observations.map((c) => (c ? m.value(c) : null)),
        },
      ],
    }));
    const breakdown =
      mode === "religion"
        ? "religions"
        : mode === "buildingLevels"
          ? "buildings"
          : mode === "rgoLevel"
            ? "materials"
            : null;
    if (breakdown) {
      const totals = new Map<string, number>();
      observations.forEach(
        (c) =>
          c &&
          Object.entries(c[breakdown]).forEach(([k, v]) => totals.set(k, (totals.get(k) ?? 0) + v)),
      );
      const names = [...totals]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name]) => name);
      const lines = names.map((name) => ({
        name: human(name),
        raw: observations.map((c) => (c ? (c[breakdown][name] ?? 0) : null)),
      }));
      result.push({
        title:
          mode === "religion"
            ? "Population by faith"
            : mode === "buildingLevels"
              ? "Building types"
              : "Raw material capacity",
        unit:
          mode === "religion"
            ? "People · six largest faiths across these dates"
            : "Levels · six largest types across these dates",
        lines,
      });
      if (mode === "religion")
        result.push({
          title: "Faith composition",
          unit: "% of population",
          lines: names.map((name) => ({
            name: human(name),
            raw: observations.map((c) => (c ? ratio(c.religions[name] ?? 0, c.population) : null)),
          })),
        });
    }
    if (mode === "political" && countryId !== undefined)
      result.push({
        title: "Great power rank",
        unit: "Lower rank is higher · absent ranks remain gaps",
        lines: [{ name: label, raw: observations.map((c) => c?.greatPowerRank ?? null) }],
      });
    return result;
  }, [observations, mode, countryId, label]);
  return (
    <div className="flex flex-col gap-3" aria-label={`${mode} history for ${label}`}>
      {graphs.map((graph) => (
        <HistoryChart key={graph.title} {...graph} dates={dates} selectedId={selectedId} />
      ))}
      {dates.length < 2 && (
        <p className="text-xs text-game-ink-500">Add another save to show change over time.</p>
      )}
    </div>
  );
}
