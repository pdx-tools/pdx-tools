import { useMemo } from "react";
import type { EChartsOption } from "@/components/viz";
import { chartTooltip, seriesColor } from "@/components/viz/echartsTheme";
import { GameButton } from "@/components/game/Button";
import { downloadData } from "@/lib/downloadData";
import { HistoryPlot, historyDate, historyGrid } from "./HistoryPlot";
import { exportHistoryCsv, historySeriesValues } from "./exportHistoryCsv";
import type { HistoryObservation } from "./observations";

export type HistoryLine = { name: string; raw: (number | null | undefined)[]; dashed?: boolean };

export function HistoryChart({
  title,
  unit,
  dates,
  lines,
  selectedId,
  good = "",
  metric = title,
  indexed = false,
}: {
  title: string;
  unit: string;
  dates: HistoryObservation[];
  lines: HistoryLine[];
  selectedId?: string;
  good?: string;
  metric?: string;
  indexed?: boolean;
}) {
  const values = useMemo(
    () => lines.map(({ raw }) => historySeriesValues(raw, indexed)),
    [lines, indexed],
  );
  const option = useMemo(
    (): EChartsOption => ({
      useUTC: true,
      animation: false,
      tooltip: { ...chartTooltip, trigger: "axis", confine: true },
      legend: { type: "scroll", top: 4, show: lines.length > 1 },
      grid: historyGrid,
      xAxis: { type: "time", axisLabel: { formatter: "{yyyy}-{MM}", hideOverlap: true } },
      yAxis: { type: "value", scale: true },
      dataZoom: [{ type: "inside", zoomOnMouseWheel: "ctrl", moveOnMouseWheel: false }],
      series: lines.map((line, i) => ({
        name: line.name,
        type: "line",
        data: values[i].map((value, j) => [historyDate(dates[j].date), value]),
        symbolSize: 5,
        connectNulls: false,
        lineStyle: line.dashed ? { width: 3, type: "dashed" } : { width: 2 },
        itemStyle: { color: seriesColor(i) },
      })),
    }),
    [dates, lines, values],
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
      <HistoryPlot option={option} date={dates[selected]?.date} values={points} height={240} />
    </section>
  );
}
