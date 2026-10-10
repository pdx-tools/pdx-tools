import { useMemo } from "react";
import { type EChartsOption } from "@/components/viz";
import { HistoryPlot } from "./HistoryPlot";
import { chartTooltip, getEChartsTheme, seriesColors } from "@/components/viz/echartsTheme";
import type { CountryObservation, MapMode } from "@/wasm/wasm_eu5";
import { formatCompact } from "@/lib/format";
import type { Snapshot } from "./types";

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

function aggregate(snapshot: Snapshot, tag: string): CountryObservation | null {
  if (tag !== "world") return snapshot.countries.find((c) => c.tag === tag) ?? null;
  const first = snapshot.countries[0];
  if (!first) return null;
  const total = {
    ...first,
    tag: "world",
    religions: new Map(),
    materials: new Map(),
    buildings: new Map(),
    marketCenters: [],
  } as CountryObservation;
  for (const key of Object.keys(first) as (keyof CountryObservation)[]) {
    if (typeof first[key] === "number")
      (total as unknown as Record<string, unknown>)[key] = snapshot.countries.reduce(
        (sum, c) => sum + Number(c[key]),
        0,
      );
  }
  total.greatPowerRank = undefined;
  for (const c of snapshot.countries)
    for (const key of ["religions", "materials", "buildings"] as const) {
      for (const [name, value] of c[key].entries())
        total[key].set(name, (total[key].get(name) ?? 0) + value);
    }
  return total;
}

type Line = { name: string; values: (number | null)[] };
function HistoryChart({
  title,
  unit,
  dates,
  lines,
  selectedHash,
}: {
  title: string;
  unit: string;
  dates: Snapshot[];
  lines: Line[];
  selectedHash?: string | null;
}) {
  const option = useMemo((): EChartsOption => {
    const theme = getEChartsTheme();

    return {
      useUTC: true,
      animation: false,
      color: [...seriesColors],
      textStyle: { color: theme.labelColor, fontFamily: theme.numFamily },
      tooltip: { ...chartTooltip, trigger: "axis", confine: true },
      legend: { type: "scroll", top: 4, textStyle: { color: theme.labelColor } },
      grid: { left: 65, right: 22, top: 40, bottom: 40 },
      xAxis: {
        type: "time",
        axisLabel: { color: theme.tickColor, formatter: "{yyyy}-{MM}" },
        axisLine: { lineStyle: { color: theme.axisColor } },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: { color: theme.tickColor, formatter: (v: number) => formatCompact(v, 1) },
        splitLine: { lineStyle: { color: theme.gridLineColor } },
      },
      series: lines.map((line, i) => ({
        id: `history/${title}/${line.name}`,
        name: line.name,
        type: "line" as const,
        data: line.values.map((v, j) => [dates[j].date, v]),
        showSymbol: true,
        symbolSize: 4,
        connectNulls: false,
        lineStyle: { width: 2 },
        itemStyle: { color: seriesColors[i % seriesColors.length] },
      })),
    };
  }, [title, dates, lines]);
  const selected = dates.findIndex((s) => s.hash === selectedHash);
  const values = useMemo(
    () => lines.map((line) => line.values[selected] ?? null),
    [lines, selected],
  );
  const exportCsv = () => {
    const quote = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["date", "campaign", "game_version", "metric", "entity", "value", "save_hash"],
      ...dates.flatMap((s, i) =>
        lines.map((line) => [
          s.date,
          s.campaignId,
          s.version,
          title,
          line.name,
          line.values[i],
          s.hash,
        ]),
      ),
    ];
    const url = URL.createObjectURL(
      new Blob([rows.map((row) => row.map(quote).join(",")).join("\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `eu5-${title.replaceAll(" ", "-")}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="mb-4 rounded-(--radius-panel) border border-game-line-strong bg-game-panel-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-game-ink-200 font-game-ui text-sm font-semibold">{title}</h3>
        <button className="text-xs text-game-ink-500 hover:text-game-ink-100" onClick={exportCsv}>
          Export CSV
        </button>
      </div>
      <p className="mt-1 font-game-num text-[11px] text-game-ink-500">{unit}</p>
      <HistoryPlot
        option={option}
        date={dates[selected]?.date}
        values={values}
        height={240}
        top={40}
        bottom={40}
        left={65}
        right={22}
      />
    </section>
  );
}

export function ContextGraphs({
  dates,
  mode,
  country = "world",
  selectedHash,
  good,
  centers,
}: {
  dates: Snapshot[];
  mode: MapMode;
  country?: string;
  selectedHash?: string | null;
  good?: string;
  centers?: string[];
}) {
  const observations = useMemo(() => dates.map((s) => aggregate(s, country)), [dates, country]);
  const graphs = useMemo(() => {
    const result = metrics[mode].map((m) => ({
      title: m.label,
      unit: m.unit,
      lines: [
        {
          name: country === "world" ? "World · owned locations" : country,
          values: observations.map((c) => (c ? m.value(c) : null)),
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
          [...c[breakdown].entries()].forEach(([k, v]) => totals.set(k, (totals.get(k) ?? 0) + v)),
      );
      const names = [...totals]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name]) => name);
      const lines = names.map((name) => ({
        name: human(name),
        values: observations.map((c) => (c ? (c[breakdown].get(name) ?? 0) : null)),
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
            values: observations.map((c) =>
              c ? ratio(c.religions.get(name) ?? 0, c.population) : null,
            ),
          })),
        });
    }
    if (mode === "political" && country !== "world")
      result.push({
        title: "Great power rank",
        unit: "Lower rank is higher · absent ranks remain gaps",
        lines: [{ name: country, values: observations.map((c) => c?.greatPowerRank ?? null) }],
      });
    if (mode === "markets" && good && centers?.length) {
      for (const metric of ["supply", "demand", "stockpile"] as const)
        result.push({
          title: `${human(good)} · ${human(metric)}`,
          unit: "Saved market units",
          lines: centers.map((center) => ({
            name: human(dates.find((s) => s.marketLabels[center])?.marketLabels[center] ?? center),
            values: dates.map(
              (s) =>
                s.markets.find((m) => String(m.center) === center && m.good === good)?.[metric] ??
                null,
            ),
          })),
        });
    }
    return result;
  }, [observations, mode, country, dates, good, centers?.join("|")]);
  return (
    <div aria-label={`${mode} evolution for ${country}`}>
      <p className="mb-3 text-xs text-game-ink-500">
        {country === "world" ? "World · owned locations" : country} · {dates.length} saved dates.
        Lines connect observations; between date movement is visual only.
      </p>
      {graphs.map((graph) => (
        <HistoryChart key={graph.title} {...graph} dates={dates} selectedHash={selectedHash} />
      ))}
      {dates.length < 2 && (
        <p className="text-xs text-game-ink-500">Add another save to show change over time.</p>
      )}
    </div>
  );
}
