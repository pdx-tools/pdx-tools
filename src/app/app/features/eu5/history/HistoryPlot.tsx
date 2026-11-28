import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ECharts } from "echarts/core";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { chartInk, seriesColor } from "@/components/viz/echartsTheme";

export const historyGrid = {
  left: 65,
  right: 22,
  top: 33,
  bottom: 44,
  outerBoundsMode: "none",
} as const;

const DOT_BLEED = 6;
const DOT_RADIUS = 5;

/** Use the same UTC instant for the line data and its playhead. */
export const historyDate = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** The saved observations stay on canvas. Small overlays follow the active save date. */
export function HistoryPlot({
  option,
  date,
  names,
  values,
  height,
}: {
  option: EChartsOption;
  date?: string;
  names: string[];
  values: (number | null)[];
  height: number;
}) {
  const chartRef = useRef<{ chart: ECharts; ready: boolean } | null>(null);
  const selectedRef = useRef<Record<string, boolean>>({});
  const prevOptionRef = useRef(option);
  const [position, setPosition] = useState<{ x: number; points: (number | null)[] } | null>(null);
  const refresh = useEffectEvent(() => {
    const active = chartRef.current;
    if (!active?.ready || active.chart.isDisposed() || !date) {
      setPosition(null);
      return;
    }
    const { chart } = active;
    const time = historyDate(date);
    const x = chart.convertToPixel({ xAxisIndex: 0 }, time) as number;
    const hidden = selectedRef.current;
    const points = values.map((value, index) => {
      const name = names[index];
      if (name !== undefined && hidden[name] === false) return null;
      if (value == null || !Number.isFinite(value)) return null;
      const y = chart.convertToPixel({ yAxisIndex: 0 }, value) as number;
      return Number.isFinite(y) ? y : null;
    });
    const next = Number.isFinite(x) ? { x, points } : null;
    setPosition((previous) =>
      previous?.x === next?.x &&
      previous?.points.length === next?.points.length &&
      previous?.points.every((point, index) => point === next?.points[index])
        ? previous
        : next,
    );
  });
  useEffect(() => {
    if (prevOptionRef.current !== option) {
      prevOptionRef.current = option;
      selectedRef.current = {};
    }
    refresh();
  }, [date, names, values, option]);
  const { top, bottom, left, right } = historyGrid;
  return (
    <div className="relative" style={{ height }}>
      <EChart
        option={option}
        style={{ height, width: "100%" }}
        onInit={(chart) => {
          const active = { chart, ready: false };
          chartRef.current = active;
          selectedRef.current = {};
          const update = () => {
            active.ready = true;
            refresh();
          };
          const onLegend = (event: unknown) => {
            const selected = (event as { selected?: Record<string, boolean> })?.selected;
            if (selected) selectedRef.current = selected;
            update();
          };
          chart.on("finished", update);
          chart.on("datazoom", update);
          chart.on("legendselectchanged", onLegend);
          return () => {
            chart.off("finished", update);
            chart.off("datazoom", update);
            chart.off("legendselectchanged", onLegend);
            chartRef.current = null;
          };
        }}
      />
      <div
        className="pointer-events-none absolute overflow-hidden"
        style={{ top, bottom, left, right }}
        aria-hidden="true"
      >
        {position && (
          <div
            className="absolute top-0 bottom-0 border-l border-dashed transition-transform duration-150 ease-out motion-reduce:transition-none"
            style={{
              borderColor: chartInk.tick,
              transform: `translateX(${position.x - left}px)`,
            }}
          />
        )}
      </div>
      <div
        className="pointer-events-none absolute overflow-hidden"
        style={{
          top: top - DOT_BLEED,
          bottom: bottom - DOT_BLEED,
          left: left - DOT_BLEED,
          right: right - DOT_BLEED,
        }}
        aria-hidden="true"
      >
        {position &&
          position.points.map((y, index) =>
            y == null ? null : (
              <div
                key={index}
                className="absolute top-0 left-0 h-2.5 w-2.5 rounded-full border transition-transform duration-150 ease-out motion-reduce:transition-none"
                style={{
                  background: seriesColor(index),
                  borderColor: chartInk.primary,
                  transform: `translate(${position.x - left + DOT_BLEED - DOT_RADIUS}px, ${y - top + DOT_BLEED - DOT_RADIUS}px)`,
                }}
              />
            ),
          )}
      </div>
    </div>
  );
}
