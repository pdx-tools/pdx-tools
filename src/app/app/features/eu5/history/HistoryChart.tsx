import { useMemo } from "react";
import type { EChartsOption } from "@/components/viz";
import { chartTooltip, seriesColor } from "@/components/viz/echartsTheme";
import { GameButton } from "@/components/game/Button";
import { downloadData } from "@/lib/downloadData";
import { HistoryPlot, historyDate, historyGrid } from "./HistoryPlot";
import { exportHistoryCsv, historySeriesValues } from "./exportHistoryCsv";
import type { HistoryDate } from "./exportHistoryCsv";

export type HistoryLine = { name: string; raw: (number | null | undefined)[]; dashed?: boolean };

const tooltipNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

function formatTooltipDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function formatAxisTooltip(params: unknown): string {
  const items = Array.isArray(params) ? params : [params];
  const entries = items as {
    marker?: string;
    seriesName?: string;
    value?: [number, number | null | undefined];
  }[];
  const timestamp = entries[0]?.value?.[0];
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return "";
  const lines = [`<div>${formatTooltipDate(timestamp)}</div>`];
  for (const item of entries) {
    const val = item.value?.[1];
    if (val == null || !Number.isFinite(val)) continue;
    lines.push(
      `<div>${item.marker ?? ""}${escapeHtml(item.seriesName ?? "")}: ${tooltipNumber.format(val)}</div>`,
    );
  }
  return lines.length > 1 ? lines.join("") : "";
}

export function HistoryChart({
  title,
  unit,
  dates,
  lines,
  selectedId,
  good = "",
  metric = title,
  indexed = false,
  inverse = false,
}: {
  title: string;
  unit: string;
  dates: HistoryDate[];
  lines: HistoryLine[];
  selectedId?: string;
  good?: string;
  metric?: string;
  indexed?: boolean;
  inverse?: boolean;
}) {
  const values = useMemo(
    () => lines.map(({ raw }) => historySeriesValues(raw, indexed)),
    [lines, indexed],
  );
  const names = useMemo(() => lines.map((line) => line.name), [lines]);
  const option = useMemo(
    (): EChartsOption => ({
      useUTC: true,
      animation: false,
      tooltip: {
        ...chartTooltip,
        trigger: "axis",
        confine: true,
        formatter: formatAxisTooltip,
      },
      legend: { type: "scroll", top: 4, show: lines.length > 1 },
      grid: historyGrid,
      xAxis: { type: "time", axisLabel: { formatter: "{yyyy}-{MM}", hideOverlap: true } },
      yAxis: { type: "value", scale: true, inverse },
      dataZoom: [{ type: "inside", zoomOnMouseWheel: "ctrl", moveOnMouseWheel: false }],
      series: lines.map((line, i) => ({
        name: line.name,
        type: "line",
        data: dates.map((entry, j) => [historyDate(entry.date), values[i]?.[j] ?? null]),
        symbolSize: 5,
        connectNulls: false,
        lineStyle: line.dashed ? { width: 3, type: "dashed" } : { width: 2 },
        itemStyle: { color: seriesColor(i) },
      })),
    }),
    [dates, inverse, lines, values],
  );
  const selected = dates.findIndex((date) => date.id === selectedId);
  const points = useMemo(
    () => values.map((series) => series[selected] ?? null),
    [selected, values],
  );
  const exportCsv = () =>
    downloadData(
      new Blob([exportHistoryCsv(dates, lines, { metric, good, indexed })], {
        type: "text/csv;charset=utf-8",
      }),
      `eu5-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`,
    );

  return (
    <section className="rounded-panel border border-game-line bg-game-panel-2 px-3 pt-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-game-ink-100">{title}</h3>
        <GameButton variant="ghost" onClick={exportCsv}>
          Export CSV
        </GameButton>
      </div>
      <p className="text-xs text-game-ink-500">{indexed ? "First observation = 100" : unit}</p>
      <HistoryPlot
        option={option}
        date={dates[selected]?.date}
        names={names}
        values={points}
        height={240}
      />
    </section>
  );
}
