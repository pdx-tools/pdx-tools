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

/** Use the same UTC instant for the line data and its playhead. */
export const historyDate = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** The saved observations stay on canvas. Small overlays follow the active save date. */
export function HistoryPlot({
  option,
  date,
  values,
  height,
}: {
  option: EChartsOption;
  date?: string;
  values: (number | null)[];
  height: number;
}) {
  const chartRef = useRef<{ chart: ECharts; ready: boolean } | null>(null);
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
    const points = values.map((value) => {
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
    refresh();
  }, [date, values, option]);
  const { top, bottom, left, right } = historyGrid;
  return (
    <div className="relative" style={{ height }}>
      <EChart
        option={option}
        style={{ height, width: "100%" }}
        onInit={(chart) => {
          const active = { chart, ready: false };
          chartRef.current = active;
          const update = () => {
            active.ready = true;
            refresh();
          };
          chart.on("finished", update);
          chart.on("datazoom", update);
          return () => {
            chart.off("finished", update);
            chart.off("datazoom", update);
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
          <>
            <div
              className="absolute top-0 bottom-0 border-l border-dashed transition-transform duration-150 ease-out motion-reduce:transition-none"
              style={{
                borderColor: chartInk.tick,
                transform: `translateX(${position.x - left}px)`,
              }}
            />
            {position.points.map((y, index) =>
              y == null ? null : (
                <div
                  key={index}
                  className="absolute top-0 left-0 h-2.5 w-2.5 rounded-full border transition-transform duration-150 ease-out motion-reduce:transition-none"
                  style={{
                    background: seriesColor(index),
                    borderColor: chartInk.primary,
                    transform: `translate(${position.x - left - 5}px, ${y - top - 5}px)`,
                  }}
                />
              ),
            )}
          </>
        )}
      </div>
    </div>
  );
}
