import { useCallback, useEffect, useRef } from "react";
import type * as echarts from "echarts/core";
import type { DefaultLabelFormatterCallbackParams } from "echarts";

/**
 * Enables a "nearest line" tooltip on a multi-series ECharts line chart, by
 * finding the closest series item to the cursor's Y positioning.
 *
 * Using `trigger: "axis"` shows all series values at the hovered x position,
 * which becomes unreadable with many series (e.g. 30 countries). Using
 * `trigger: "item"` requires the user to hover precisely over a data point,
 * which is fiddly. This hook restores the previous antd-charts behavior of
 * highlighting whichever series line is closest to the cursor.
 */
export function useNearestSeriesItem() {
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const mousePixelYRef = useRef<number | null>(null);
  const zrCleanupRef = useRef<(() => void) | null>(null);

  const onInit = useCallback((chart: echarts.ECharts) => {
    chartInstanceRef.current = chart;
    const zr = chart.getZr();
    const onMouseMove = (e: { offsetX: number; offsetY: number }) => {
      mousePixelYRef.current = e.offsetY;
    };
    zr.on("mousemove", onMouseMove);
    zrCleanupRef.current = () => zr.off("mousemove", onMouseMove);
  }, []);

  useEffect(() => {
    return () => {
      zrCleanupRef.current?.();
    };
  }, []);

  const getClosestItem = useCallback(
    (
      items: DefaultLabelFormatterCallbackParams[],
    ): DefaultLabelFormatterCallbackParams => {
      const chart = chartInstanceRef.current;
      const pixelY = mousePixelYRef.current;

      if (chart === null || pixelY === null || items.length === 0) {
        return items[0]!;
      }

      const [, dataY] = chart.convertFromPixel({ seriesIndex: 0 }, [
        0,
        pixelY,
      ]) as [number, number];
      let closest = items[0]!;
      let minDist = Infinity;
      for (const item of items) {
        const dist = Math.abs((item.data as [number, number])[1] - dataY);
        if (dist < minDist) {
          minDist = dist;
          closest = item;
        }
      }
      return closest;
    },
    [],
  );

  return { onInit, getClosestItem };
}
