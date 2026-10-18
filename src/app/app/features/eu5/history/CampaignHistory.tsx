import { useEffectEvent, useMemo, useState } from "react";
import type { ECharts } from "echarts/core";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { chartTooltip, getEChartsTheme, seriesColor } from "@/components/viz/echartsTheme";
import { formatCompact, formatFloat } from "@/lib/format";
import type { MapMode } from "@/wasm/wasm_eu5";
import { Chip, GameButton, GameSelect, SectionTitle } from "../components";
import type { HistoryResult, HistoryRow } from "./analysisStore";
import { campaignAnalysis } from "./analysisClient";
import { BREAKDOWN_CHARTS, COUNTRY_CHARTS, GREAT_POWER_RANK, humanize } from "./historyMetrics";
import { downloadFile, historyCsv, indexedValues } from "./historySeries";
import type { HistoryLine } from "./historySeries";
import { MARKET_METRICS } from "./snapshotTables";
import type { MarketMetric } from "./snapshotTables";
import { useHistoryQuery } from "./useHistoryQuery";

/** What the history follows. Countries use the full country ID, markets their center location. */
export type HistoryFocus =
  | { kind: "world" }
  | { kind: "country"; id: number; name: string }
  | { kind: "market"; center: number; name: string }
  | { kind: "location"; ids: number[]; name: string };

type ChartProps = {
  campaignId: string;
  playheadHash: string | null;
  onSelectSnapshot?: (hash: string) => void;
};

const MAX_MARKETS = 6;
const MAX_BREAKDOWN_LINES = 6;

/**
 * The campaign history of the focus, for the charts of the map mode. Each
 * point is a snapshot. A dashed line marks the snapshot that the map shows.
 */
export function CampaignHistory({
  mode,
  focus,
  ...props
}: ChartProps & { mode: MapMode; focus: HistoryFocus }) {
  let content: React.ReactNode;
  if (focus.kind === "location") content = <LocationHistory focus={focus} {...props} />;
  else if (focus.kind === "market" || mode === "markets")
    content = <MarketHistory focus={focus} {...props} />;
  else content = <CountryHistory mode={mode} focus={focus} {...props} />;

  return (
    <div className="flex flex-col gap-4 p-4">
      {content}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-game-line pt-3">
        <p className="text-xs text-game-ink-500">
          Points are saved dates. A gap is a date with no value.
        </p>
        <GameButton
          variant="ghost"
          onClick={() =>
            void campaignAnalysis()
              .exportObservations(props.campaignId)
              .then((blob) => downloadFile("eu5-snapshots.json", blob, "application/json"))
          }
        >
          Export JSON
        </GameButton>
      </footer>
    </div>
  );
}

function CountryHistory({
  mode,
  focus,
  ...props
}: ChartProps & { mode: MapMode; focus: Extract<HistoryFocus, { kind: "world" | "country" }> }) {
  const key = focus.kind === "world" ? "world" : `country:${focus.id}`;
  const { result, error, loading } = useHistoryQuery(
    props.campaignId,
    key,
    (analysis, campaignId) =>
      analysis.countryHistory(campaignId, focus.kind === "world" ? { kind: "world" } : focus),
  );
  const name = focus.kind === "world" ? "World" : focus.name;

  const charts = useMemo(() => {
    if (!result) return [];
    const observations = result.rows.map((row) => row.value);
    const line = (value: (typeof COUNTRY_CHARTS)[MapMode][number]["value"]): HistoryLine => ({
      name,
      values: observations.map((c) => (c ? value(c) : null)),
    });
    const charts = COUNTRY_CHARTS[mode].map((chart) => ({
      title: chart.title,
      unit: chart.unit,
      lines: [line(chart.value)],
    }));
    if (mode === "political" && focus.kind === "country")
      charts.push({
        title: GREAT_POWER_RANK.title,
        unit: GREAT_POWER_RANK.unit,
        lines: [line(GREAT_POWER_RANK.value)],
      });
    const breakdown = BREAKDOWN_CHARTS[mode];
    if (breakdown) {
      const totals = new Map<string, number>();
      for (const c of observations)
        for (const [k, v] of c?.[breakdown.breakdown] ?? [])
          totals.set(k, (totals.get(k) ?? 0) + v);
      const keys = [...totals]
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_BREAKDOWN_LINES)
        .map(([k]) => k);
      charts.push({
        title: breakdown.title,
        unit: breakdown.unit,
        lines: keys.map((k) => ({
          name: humanize(k),
          values: observations.map((c) => (c ? (c[breakdown.breakdown].get(k) ?? 0) : null)),
        })),
      });
    }
    return charts;
  }, [result, mode, name, focus.kind]);

  if (error) return <HistoryNote>{error}</HistoryNote>;
  if (!result)
    return (
      <HistoryNote>{loading ? "Loading campaign history…" : "No saved dates yet."}</HistoryNote>
    );
  if (!charts.length) return <HistoryNote>This map mode has no campaign history.</HistoryNote>;
  return (
    <>
      <HistoryHeading name={name} result={result} />
      {charts.map((chart) => (
        <HistoryChart key={chart.title} {...chart} rows={result.rows} {...props} />
      ))}
    </>
  );
}

function LocationHistory({
  focus,
  ...props
}: ChartProps & { focus: Extract<HistoryFocus, { kind: "location" }> }) {
  const { result, error, loading } = useHistoryQuery(
    props.campaignId,
    `locations:${focus.ids.join(",")}`,
    (analysis, campaignId) => analysis.locationPopulation(campaignId, focus.ids),
  );
  const charts = useMemo(() => {
    if (!result) return [];
    const values = result.rows.map((row) => row.value);
    const first = values.find((value) => value != null);
    return [
      { title: "Population", unit: "People", lines: [{ name: focus.name, values }] },
      {
        title: "Population change",
        unit: "People since the first saved date",
        lines: [
          {
            name: focus.name,
            values: values.map((value) => (value == null || first == null ? null : value - first)),
          },
        ],
      },
    ];
  }, [result, focus.name]);

  if (error) return <HistoryNote>{error}</HistoryNote>;
  if (!result)
    return (
      <HistoryNote>{loading ? "Loading campaign history…" : "No saved dates yet."}</HistoryNote>
    );
  return (
    <>
      <HistoryHeading name={focus.name} result={result} />
      {charts.map((chart) => (
        <HistoryChart key={chart.title} {...chart} rows={result.rows} {...props} />
      ))}
    </>
  );
}

const marketLabel = (name: string | null | undefined, center: number) =>
  `Market at ${name ? humanize(name) : `location ${center}`}`;

function MarketHistory({
  focus,
  ...props
}: ChartProps & { focus: Exclude<HistoryFocus, { kind: "location" }> }) {
  const { campaignId } = props;
  const catalog = useHistoryQuery(campaignId, "catalog", (analysis, campaignId) =>
    analysis.marketCatalog(campaignId),
  );
  const countryCenters = useHistoryQuery(
    campaignId,
    focus.kind === "country" ? `centers:${focus.id}` : "centers",
    focus.kind === "country"
      ? (analysis, campaignId) => analysis.marketCenters(campaignId, focus.id)
      : null,
  );
  const goods = catalog.result?.goods ?? [];
  const names = useMemo(
    () => new Map((catalog.result?.centers ?? []).map(({ center, name }) => [center, name])),
    [catalog.result],
  );
  const [chosenGood, setGood] = useState<string | null>(null);
  const [chosenCenters, setCenters] = useState<number[] | null>(null);
  const [indexed, setIndexed] = useState(false);

  const good =
    chosenGood && goods.includes(chosenGood)
      ? chosenGood
      : (goods.find((g) => g === "wheat") ?? goods[0] ?? null);
  const available = useMemo(() => {
    const all = [...names.keys()];
    const centers =
      focus.kind === "market"
        ? [focus.center]
        : focus.kind === "country"
          ? (countryCenters.result ?? [])
          : all;
    return centers.sort((a, b) =>
      marketLabel(names.get(a), a).localeCompare(marketLabel(names.get(b), b)),
    );
  }, [focus, names, countryCenters.result]);
  const centers = (chosenCenters ?? []).filter((c) => available.includes(c));
  const shown = centers.length
    ? centers
    : available.slice(0, focus.kind === "world" ? 1 : MAX_MARKETS);

  const history = useHistoryQuery(
    campaignId,
    `market:${good}:${shown.join(",")}`,
    good && shown.length
      ? (analysis, campaignId) => analysis.marketHistory(campaignId, good, shown)
      : null,
  );
  const result = history.result;
  const charts = useMemo(() => {
    if (!result) return [];
    return MARKET_METRICS.map((metric: MarketMetric) => {
      const lines = shown.map((center, i) => {
        const values = result.rows.map((row) => row.value?.[i]?.[metric] ?? null);
        return {
          name: marketLabel(names.get(center), center),
          values: indexed ? indexedValues(values) : values,
        };
      });
      return {
        title: `${humanize(good ?? "")} · ${humanize(metric)}`,
        unit: indexed ? "First saved date = 100" : metric === "price" ? "Ducats" : "Goods",
        lines,
        metric,
      };
    });
    // `shown` is derived each render, so compare it by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, names, indexed, good, shown.join(",")]);

  const error = catalog.error ?? history.error;
  if (error) return <HistoryNote>{error}</HistoryNote>;
  if (!catalog.result) return <HistoryNote>Loading campaign history…</HistoryNote>;
  if (!goods.length) return <HistoryNote>No market has goods at these saved dates.</HistoryNote>;

  return (
    <>
      <div className="flex flex-col gap-2">
        <SectionTitle className="mb-0">Market history</SectionTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-44">
            <GameSelect value={good ?? undefined} onValueChange={setGood}>
              <GameSelect.Trigger aria-label="Good">
                <GameSelect.Value />
              </GameSelect.Trigger>
              <GameSelect.Content className="max-h-72 overflow-y-auto">
                {goods.map((g) => (
                  <GameSelect.Item key={g} value={g}>
                    {humanize(g)}
                  </GameSelect.Item>
                ))}
              </GameSelect.Content>
            </GameSelect>
          </div>
          {focus.kind !== "market" && shown.length < MAX_MARKETS && (
            <div className="w-56">
              <GameSelect value="" onValueChange={(value) => setCenters([...shown, Number(value)])}>
                <GameSelect.Trigger aria-label="Add market">
                  <GameSelect.Value placeholder="Add market…" />
                </GameSelect.Trigger>
                <GameSelect.Content className="max-h-72 overflow-y-auto">
                  {available
                    .filter((c) => !shown.includes(c))
                    .map((c) => (
                      <GameSelect.Item key={c} value={String(c)}>
                        {marketLabel(names.get(c), c)}
                      </GameSelect.Item>
                    ))}
                </GameSelect.Content>
              </GameSelect>
            </div>
          )}
          <label className="flex items-center gap-1.5 text-xs text-game-ink-300">
            <input
              type="checkbox"
              checked={indexed}
              onChange={(e) => setIndexed(e.target.checked)}
            />
            First saved date = 100
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {shown.map((c, i) => (
            <Chip key={c} dot={seriesColor(i)}>
              {marketLabel(names.get(c), c)}
              {focus.kind !== "market" && shown.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove ${marketLabel(names.get(c), c)}`}
                  className="text-game-ink-500 hover:text-game-ink-100"
                  onClick={() => setCenters(shown.filter((x) => x !== c))}
                >
                  ×
                </button>
              )}
            </Chip>
          ))}
        </div>
        <p className="text-xs text-game-ink-500">
          Market IDs change between saves, so a market is its center location. A date with no market
          at that center is a gap.
        </p>
      </div>
      {!result ? (
        <HistoryNote>
          {history.loading || countryCenters.loading
            ? "Loading campaign history…"
            : "Choose a market."}
        </HistoryNote>
      ) : (
        <>
          <HistoryHeading name={humanize(good ?? "")} result={result} />
          {charts.map(({ metric, ...chart }) => (
            <HistoryChart
              key={metric}
              {...chart}
              rows={result.rows}
              csv={{ metric, good: good ?? "", indexed }}
              {...props}
            />
          ))}
        </>
      )}
    </>
  );
}

function HistoryHeading({ name, result }: { name: string; result: HistoryResult<unknown> }) {
  return (
    <p className="font-game-num text-[11px] text-game-ink-500 tabular-nums">
      {name} · {result.snapshots} saved dates
    </p>
  );
}

function HistoryNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-game-ink-500">{children}</p>;
}

const GRID = { left: 60, right: 20, top: 36, bottom: 28 };

function HistoryChart({
  title,
  unit,
  rows,
  lines,
  campaignId,
  playheadHash,
  onSelectSnapshot,
  csv,
}: ChartProps & {
  title: string;
  unit: string;
  rows: HistoryRow<unknown>[];
  lines: HistoryLine[];
  csv?: { metric: string; good?: string; indexed?: boolean };
}) {
  const playhead = rows.find((row) => row.hash === playheadHash)?.date;
  const option = useMemo((): EChartsOption => {
    const theme = getEChartsTheme();
    const time = (date: string) => Date.parse(`${date}T00:00:00Z`);
    const format = (value: number) =>
      Math.abs(value) < 100 ? formatFloat(value, 2) : formatCompact(value, 1);
    return {
      useUTC: true,
      animation: false,
      textStyle: { color: theme.labelColor, fontFamily: theme.numFamily },
      tooltip: {
        ...chartTooltip,
        trigger: "axis",
        confine: true,
        formatter: (params) => {
          const items = Array.isArray(params) ? params : [params];
          const row = rows[items[0]?.dataIndex ?? -1];
          if (!row) return "";
          const values = items.map((item) => {
            const value = (item.value as [number, number | null])[1];
            return `${escapeEChartsHtml(String(item.seriesName))}: ${value == null ? "–" : format(value)}`;
          });
          return [`<strong>${escapeEChartsHtml(row.date)}</strong>`, ...values].join("<br/>");
        },
      },
      legend:
        lines.length > 1
          ? { type: "scroll", top: 4, textStyle: { color: theme.labelColor, fontSize: 11 } }
          : undefined,
      grid: GRID,
      xAxis: {
        type: "time",
        axisLabel: { color: theme.tickColor, formatter: "{yyyy}", hideOverlap: true },
        axisLine: { lineStyle: { color: theme.axisColor } },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: { color: theme.tickColor, formatter: (v: number) => format(v) },
        splitLine: { lineStyle: { color: theme.gridLineColor } },
      },
      series: lines.map((line, i) => ({
        name: line.name,
        type: "line" as const,
        color: seriesColor(i),
        data: line.values.map((value, j) => [time(rows[j].date), value]),
        showSymbol: true,
        symbolSize: 5,
        connectNulls: false,
        lineStyle: { width: 2 },
        cursor: onSelectSnapshot ? "pointer" : "default",
        markLine:
          i === 0 && playhead
            ? {
                silent: true,
                symbol: "none",
                label: { show: false },
                lineStyle: { type: "dashed", color: theme.labelColor, width: 1 },
                data: [{ xAxis: time(playhead) }],
              }
            : undefined,
      })),
    };
  }, [rows, lines, playhead, onSelectSnapshot]);

  const select = useEffectEvent((dataIndex: number) => {
    const row = rows[dataIndex];
    if (row) onSelectSnapshot?.(row.hash);
  });
  const onInit = (chart: ECharts) => {
    chart.on("click", (params) => select(params.dataIndex));
  };

  const exportCsv = () =>
    downloadFile(
      `eu5-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.csv`,
      historyCsv(rows, campaignId, lines, csv ?? { metric: title }),
      "text/csv;charset=utf-8",
    );

  return (
    <section aria-label={title}>
      <div className="flex items-baseline justify-between gap-2">
        <SectionTitle className="mb-0">{title}</SectionTitle>
        <button
          type="button"
          className="font-game-ui text-[11px] text-game-ink-500 hover:text-game-ink-100"
          onClick={exportCsv}
        >
          Export CSV
        </button>
      </div>
      <p className="font-game-num text-[11px] text-game-ink-500">{unit}</p>
      <EChart option={option} onInit={onInit} style={{ height: 220, width: "100%" }} />
    </section>
  );
}
