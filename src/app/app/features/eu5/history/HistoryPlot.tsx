import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ECharts } from "echarts/core";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { seriesColors, getEChartsTheme } from "@/components/viz/echartsTheme";

/** The saved observations stay on canvas. Only these small overlays move during playback. */
export function HistoryPlot({
  option,
  date,
  values,
  height,
  top,
  bottom,
  left,
  right,
}: {
  option: EChartsOption;
  date?: string;
  values: (number | null)[];
  height: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
}) {
  const chartRef = useRef<ECharts | null>(null);
  const [position, setPosition] = useState<{ x: number; points: (number | null)[] } | null>(null);
  const refresh = useEffectEvent(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed() || !date) {
      setPosition(null);
      return;
    }
    const time = Date.parse(`${date}T00:00:00Z`);
    const x = chart.convertToPixel({ xAxisIndex: 0 }, time) as number;
    const points = values.map((value) =>
      value == null || !Number.isFinite(value)
        ? null
        : (chart.convertToPixel({ yAxisIndex: 0 }, value) as number),
    );
    const next = Number.isFinite(x) ? { x, points } : null;
    setPosition((previous) =>
      JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
    );
  });
  useEffect(() => {
    refresh();
  }, [date, values, option]);
  const theme = getEChartsTheme();
  return (
    <div className="relative" style={{ height }}>
      <EChart
        mergeUpdates
        option={option}
        style={{ height, width: "100%" }}
        onInit={(chart) => {
          chartRef.current = chart;
          chart.on("finished", () => refresh());
          chart.on("datazoom", () => refresh());
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
              className="absolute top-0 bottom-0 border-l border-dashed transition-transform duration-800 ease-out motion-reduce:transition-none"
              style={{
                borderColor: theme.tickColor,
                transform: `translateX(${position.x - left}px)`,
              }}
            />
            {position.points.map((y, index) =>
              y == null ? null : (
                <div
                  key={index}
                  className="absolute top-0 left-0 h-2.5 w-2.5 rounded-full border transition-transform duration-800 ease-out motion-reduce:transition-none"
                  style={{
                    background: seriesColors[index % seriesColors.length],
                    borderColor: theme.labelColor,
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
