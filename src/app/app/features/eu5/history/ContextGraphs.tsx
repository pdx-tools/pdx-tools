import { useMemo } from "react";
import type { CountryMetric, MapMode } from "@/wasm/wasm_eu5";
import { worldHistoryLabel } from "./CountryPicker";
import type { HistoryDate } from "./exportHistoryCsv";
import { HistoryChart } from "./HistoryChart";
import type { HistoryLine } from "./HistoryChart";
import type { ModeHistoryData } from "./useHistorySeries";

type Read = (metric: CountryMetric, index: number) => number | null;
type GraphSpec = {
  label: string;
  unit: string;
  value: (read: Read, index: number) => number | null;
};

const ratio = (n: number | null, d: number | null) =>
  n != null && d != null && d > 0 ? (100 * n) / d : null;
const diff = (a: number | null, b: number | null) => (a != null && b != null ? a - b : null);
const per = (n: number | null, d: number | null) =>
  n != null && d != null && d > 0 ? n / d : null;

const population: GraphSpec = {
  label: "Population",
  unit: "People",
  value: (read, i) => read("population", i),
};
const effective: GraphSpec = {
  label: "Effective development",
  unit: "Development",
  value: (read, i) => read("effectiveDevelopment", i),
};
const realization: GraphSpec = {
  label: "Development weighted control",
  unit: "%",
  value: (read, i) => ratio(read("effectiveDevelopment", i), read("development", i)),
};

const graphsByMode: Record<MapMode, GraphSpec[]> = {
  political: [
    population,
    {
      label: "Active state capacity",
      unit: "Population × effective development",
      value: (read, i) => read("stateCapacity", i),
    },
    {
      label: "Monthly tax and trade income",
      unit: "Saved income",
      value: (read, i) => read("income", i),
    },
  ],
  control: [
    realization,
    {
      label: "Development lost to control",
      unit: "Development",
      value: (read, i) => diff(read("development", i), read("effectiveDevelopment", i)),
    },
  ],
  development: [
    {
      label: "Total development",
      unit: "Development",
      value: (read, i) => read("development", i),
    },
    {
      label: "Average development per location",
      unit: "Development / location",
      value: (read, i) => per(read("development", i), read("locations", i)),
    },
  ],
  stateEfficacy: [effective, realization],
  wealth: [
    {
      label: "Total wealth",
      unit: "Potential tax base",
      value: (read, i) => read("wealth", i),
    },
    {
      label: "Average wealth per location",
      unit: "Potential tax base / location",
      value: (read, i) => per(read("wealth", i), read("locations", i)),
    },
  ],
  unrealizedTaxBase: [
    {
      label: "Tax base gap",
      unit: "Potential − realized tax base",
      value: (read, i) => diff(read("wealth", i), read("tax", i)),
    },
    {
      label: "Tax realization",
      unit: "%",
      value: (read, i) => ratio(read("tax", i), read("wealth", i)),
    },
  ],
  population: [
    population,
    {
      label: "Urbanization",
      unit: "% living in towns, cities and megalopolises",
      value: (read, i) => ratio(read("urbanPopulation", i), read("population", i)),
    },
  ],
  populationGrowth: [
    {
      label: "Recorded yearly births",
      unit: "People / year at the saved monthly rate",
      value: (read, i) => read("births", i),
    },
    {
      label: "Yearly reproduction rate",
      unit: "% · excludes migration and deaths",
      value: (read, i) => ratio(read("births", i), read("population", i)),
    },
  ],
  buildingLevels: [
    {
      label: "Building levels",
      unit: "Levels · by location owner",
      value: (read, i) => read("buildingLevels", i),
    },
    {
      label: "Building employment",
      unit: "People",
      value: (read, i) => read("buildingEmployment", i),
    },
  ],
  religion: [],
  rgoLevel: [
    {
      label: "RGO levels",
      unit: "Levels",
      value: (read, i) => read("rgoLevels", i),
    },
  ],
  markets: [],
};

const human = (s: string) => s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

function sumValues(values: readonly (number | null | undefined)[]) {
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

export function ContextGraphs({
  dates,
  data,
  mode,
  countryId,
  countryName,
  selectedId,
}: {
  dates: HistoryDate[];
  data: ModeHistoryData;
  mode: MapMode;
  countryId?: number;
  countryName?: string;
  selectedId?: string;
}) {
  const label = countryId === undefined ? worldHistoryLabel : (countryName ?? String(countryId));
  const graphs = useMemo(() => {
    const read: Read = (metric, index) => data.metrics[metric]?.[index] ?? null;
    const result: { title: string; unit: string; lines: HistoryLine[]; inverse?: boolean }[] =
      graphsByMode[mode].map((graph) => ({
        title: graph.label,
        unit: graph.unit,
        lines: [
          {
            name: label,
            raw: dates.map((_, index) => graph.value(read, index)),
          },
        ],
      }));

    if (mode === "religion" || mode === "buildingLevels" || mode === "rgoLevel") {
      const top = [...data.breakdown]
        .sort((a, b) => sumValues(b.values) - sumValues(a.values))
        .slice(0, 6);
      if (top.length > 0) {
        const lines: HistoryLine[] = top.map((series) => ({
          name: human(series.key),
          raw: series.values,
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
        if (mode === "religion") {
          result.push({
            title: "Faith composition",
            unit: "% of population",
            lines: top.map((series) => ({
              name: human(series.key),
              raw: series.values.map((value, index) =>
                ratio(value ?? null, read("population", index)),
              ),
            })),
          });
        }
      }
    }

    if (mode === "political" && countryId !== undefined) {
      result.push({
        title: "Great power rank",
        unit: "Lower rank is higher · absent ranks remain gaps",
        inverse: true,
        lines: [
          {
            name: label,
            raw: dates.map((_, index) => read("greatPowerRank", index)),
          },
        ],
      });
    }
    return result;
  }, [dates, data, mode, countryId, label]);

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
