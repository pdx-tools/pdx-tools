import { useEffectEvent, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { chartInk, neutralFill } from "@/components/viz/echartsTheme";
import { GameButton } from "../../components";

/** The space around the plot of a scatter */
export const SCATTER_GRID = { left: 56, right: 24, top: 32, bottom: 44 };

/** A drag must be this many px wide and high to zoom. A smaller one is a click. */
const MIN_BOX = 8;

// The zoom comes only from a box. A disabled zoom does not take the wheel
// or a drag, so the wheel scrolls the panel. No filter, so each dot keeps
// its index.
const BOX_ONLY = { type: "inside", disabled: true, filterMode: "none" } as const;

/** The zoom of each axis of a scatter. `useBoxZoom` sets them. */
export const SCATTER_ZOOM = [
  { ...BOX_ONLY, id: "zoom-x", xAxisIndex: 0 },
  { ...BOX_ONLY, id: "zoom-y", yAxisIndex: 0 },
];

type Pixel = [number, number];

function plotOf(chart: echarts.ECharts) {
  return {
    left: SCATTER_GRID.left,
    top: SCATTER_GRID.top,
    right: chart.getWidth() - SCATTER_GRID.right,
    bottom: chart.getHeight() - SCATTER_GRID.bottom,
  };
}

function boxOf(a: Pixel, b: Pixel) {
  return {
    x: Math.min(a[0], b[0]),
    y: Math.min(a[1], b[1]),
    width: Math.abs(a[0] - b[0]),
    height: Math.abs(a[1] - b[1]),
  };
}

function zoomAll(chart: echarts.ECharts, range: { start: number; end: number }) {
  chart.dispatchAction({
    type: "dataZoom",
    batch: SCATTER_ZOOM.map(({ id }) => ({ dataZoomId: id, ...range })),
  });
}

/**
 * Drag a box over a scatter to zoom each axis to the box. `option` is the
 * option of the chart: a new option draws the chart again with no zoom.
 */
export function useBoxZoom(option: unknown) {
  // The option that the zoom is for. In a box, because an option can be a function.
  const [zoomedFor, setZoomedFor] = useState<{ option: unknown } | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const markZoomed = useEffectEvent(() => setZoomedFor({ option }));

  const attach = (chart: echarts.ECharts) => {
    chartRef.current = chart;
    const zr = chart.getZr();
    let start: Pixel | null = null;
    let end: Pixel | null = null;
    let box: echarts.graphic.Rect | null = null;

    const clamp = ([x, y]: Pixel): Pixel => {
      const plot = plotOf(chart);
      return [
        Math.min(Math.max(x, plot.left), plot.right),
        Math.min(Math.max(y, plot.top), plot.bottom),
      ];
    };

    const finish = () => {
      if (box) zr.remove(box);
      const drawn = start && end ? boxOf(start, end) : null;
      box = null;
      start = null;
      end = null;
      if (!drawn || drawn.width < MIN_BOX || drawn.height < MIN_BOX || chart.isDisposed()) return;

      const corner = (pixel: Pixel) => chart.convertFromPixel({ gridIndex: 0 }, pixel) as number[];
      const [x0 = 0, y0 = 0] = corner([drawn.x, drawn.y + drawn.height]);
      const [x1 = 0, y1 = 0] = corner([drawn.x + drawn.width, drawn.y]);
      chart.dispatchAction({
        type: "dataZoom",
        batch: [
          { dataZoomId: "zoom-x", startValue: x0, endValue: x1 },
          { dataZoomId: "zoom-y", startValue: y0, endValue: y1 },
        ],
      });
      markZoomed();

      // The release of the drag is also a click, which must not select the dot under it.
      const stop = (ev: MouseEvent) => ev.stopPropagation();
      window.addEventListener("click", stop, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 0);
    };

    zr.on("mousedown", (e) => {
      const native = e.event as unknown as MouseEvent | undefined;
      if (native && native.button !== 0) return;
      const at: Pixel = [e.offsetX, e.offsetY];
      const plot = plotOf(chart);
      if (at[0] < plot.left || at[0] > plot.right || at[1] < plot.top || at[1] > plot.bottom) {
        return;
      }
      // No text selection on the page while the box is drawn.
      native?.preventDefault();
      start = at;
      window.addEventListener("mouseup", finish, { once: true });
    });

    zr.on("mousemove", (e) => {
      if (!start) return;
      end = clamp([e.offsetX, e.offsetY]);
      const shape = boxOf(start, end);
      if (box) {
        box.setShape(shape);
      } else {
        box = new echarts.graphic.Rect({
          shape,
          style: { fill: neutralFill, stroke: chartInk.secondary, lineWidth: 1, lineDash: [4, 3] },
          silent: true,
          z: 100,
        });
        zr.add(box);
      }
    });
  };

  const reset = () => {
    const chart = chartRef.current;
    if (chart && !chart.isDisposed()) zoomAll(chart, { start: 0, end: 100 });
    setZoomedFor(null);
  };

  return { attach, zoomed: zoomedFor?.option === option, reset };
}

/** The hint under a scatter that has a box zoom */
export const BOX_ZOOM_HINT = "Drag over dots to zoom in.";

/** A button over the top right of a zoomed scatter */
export function ResetZoom({ zoom }: { zoom: ReturnType<typeof useBoxZoom> }) {
  if (!zoom.zoomed) return null;
  return (
    <GameButton className="absolute top-0 right-6" onClick={zoom.reset}>
      Reset zoom
    </GameButton>
  );
}
