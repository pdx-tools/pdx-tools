import { describe, expect, it, vi } from "vitest";
import type * as echarts from "echarts/core";
import { animatedOption } from "./EChart";
import type { EChartsOption } from "./EChart";
import { barOverlayOption, supportsBarOverlay } from "./barOverlay";
import { adaptiveDuration, CHART_UPDATE_DURATION, easeChartUpdate } from "./chartMotion";
import { findScatterSeriesIndex, gpuScatterOption } from "./gpuScatter";
import { animateSankey, captureSankey } from "./sankeyTransitions";

describe("chartMotion", () => {
  it("shortens update duration for rapid playback intervals and caps slow intervals", () => {
    expect(adaptiveDuration(null, 1000)).toBe(CHART_UPDATE_DURATION);
    expect(adaptiveDuration(1000, 1300)).toBeCloseTo(240, 5);
    expect(adaptiveDuration(1000, 3000)).toBe(CHART_UPDATE_DURATION);
    expect(adaptiveDuration(1000, 900)).toBe(0);
  });

  it("eases monotonically from 0 to 1", () => {
    expect(easeChartUpdate(0)).toBe(0);
    expect(easeChartUpdate(0.5)).toBe(0.5);
    expect(easeChartUpdate(1)).toBe(1);
    expect(easeChartUpdate(0.25)).toBeLessThan(0.25);
    expect(easeChartUpdate(0.75)).toBeGreaterThan(0.75);
  });
});

describe("animatedOption", () => {
  it("derives itemId from id, name, or the first category dimension without domain hardcoding", () => {
    const goodChart = animatedOption(
      {
        dataset: {
          source: [{ goodName: "Wheat", value: 12 }],
          dimensions: ["goodName", "value"],
        },
        series: [{ type: "bar", name: "Shortage" }],
      },
      240,
    );
    const series = Array.isArray(goodChart.series) ? goodChart.series[0] : goodChart.series;
    expect(series).toMatchObject({
      id: "transition/bar/Shortage",
      encode: { itemId: "goodName" },
      label: { valueAnimation: true },
    });
    expect(goodChart.animationDurationUpdate).toBe(240);

    const idChart = animatedOption(
      {
        dataset: {
          source: [{ id: 7, label: "Peasants", share: 0.4 }],
          dimensions: ["label", "share"],
        },
        series: [{ type: "bar" }],
      },
      400,
    );
    const idDataset = Array.isArray(idChart.dataset) ? idChart.dataset[0] : idChart.dataset;
    expect(idDataset?.dimensions).toEqual(["label", "share", "id"]);
    const idSeries = Array.isArray(idChart.series) ? idChart.series[0] : idChart.series;
    expect(idSeries).toMatchObject({ encode: { itemId: "id" } });
  });

  it("assigns stable ids to primitive bar series items using category labels", () => {
    const opt = animatedOption(
      {
        xAxis: { type: "category", data: ["0-10%", "10-20%"] },
        series: [{ type: "bar", data: [5, 12] }],
      },
      300,
    );
    const series = Array.isArray(opt.series) ? opt.series[0] : opt.series;
    expect(series && "data" in series ? series.data : undefined).toEqual([
      { value: 5, name: "0-10%", id: "0-10%" },
      { value: 12, name: "10-20%", id: "10-20%" },
    ]);
  });

  it("ignores non-primitive id fields and does not attach dataset itemId to inline-data series", () => {
    const opt = animatedOption(
      {
        dataset: {
          source: [{ id: undefined, label: "Rural", share: 0.6 }],
          dimensions: ["label", "share"],
        },
        series: [
          { type: "bar", name: "DatasetBars" },
          { type: "line", name: "InlineLine", data: [1, 2] },
        ],
      },
      250,
    );
    const series = Array.isArray(opt.series) ? opt.series : [];
    expect(series[0]).toMatchObject({ encode: { itemId: "label" } });
    expect(series[1]).not.toHaveProperty("encode");
  });
});

describe("barOverlay", () => {
  it("accepts Cartesian bar charts and rejects mixed or unsupported bar options", () => {
    expect(supportsBarOverlay({ series: [{ type: "bar", data: [1, 2] }] })).toBe(true);
    expect(
      supportsBarOverlay({
        series: [
          { type: "bar", data: [1, 2] },
          { type: "line", data: [1, 2] },
        ],
      }),
    ).toBe(false);
    expect(supportsBarOverlay({ series: [{ type: "bar", large: true, data: [1] }] })).toBe(false);
    expect(supportsBarOverlay({ series: [{ type: "bar", clip: false, data: [1] }] })).toBe(false);
    expect(supportsBarOverlay({ series: [{ type: "bar", animation: false, data: [1] }] })).toBe(
      false,
    );
  });

  it("promotes bar series and attached markLine/markPoint/markArea to zlevel 1", () => {
    const layered = barOverlayOption({
      series: [
        {
          type: "bar",
          name: "A",
          markLine: { data: [{ xAxis: 0 }] },
        },
      ],
    });
    const series = Array.isArray(layered.series) ? layered.series : [];
    expect(series[0]).toMatchObject({
      type: "bar",
      name: "A",
      zlevel: 1,
      markLine: { zlevel: 1 },
    });
  });
});

describe("gpuScatterOption", () => {
  it("finds a single Cartesian scatter series even after reference line series", () => {
    const multi: EChartsOption = {
      series: [
        {
          type: "line",
          data: [
            [0, 0],
            [10, 10],
          ],
        },
        { type: "scatter", data: [{ id: 1, name: "France", value: [5, 5] }] },
      ],
    };
    expect(findScatterSeriesIndex(multi)).toBe(1);
    expect(
      findScatterSeriesIndex({
        series: [
          { type: "scatter", data: [] },
          { type: "scatter", data: [] },
        ],
      }),
    ).toBe(-1);
  });

  it("preserves reference series order, strips label-series dot opacity, and remaps callbacks", () => {
    const layoutCalls: number[] = [];
    const formatterCalls: number[] = [];
    const sizeCalls: number[] = [];
    const option: EChartsOption = {
      series: [
        {
          type: "line",
          id: "diag",
          data: [
            [0, 0],
            [100, 100],
          ],
        },
        {
          type: "scatter",
          id: "countries",
          symbolSize: (_val, params) => {
            sizeCalls.push(params.dataIndex);
            return 10 + params.dataIndex;
          },
          data: [
            { id: 1, name: "A", value: [1, 2], label: { show: false } },
            {
              id: 2,
              name: "B",
              value: [3, 4],
              label: { show: true },
              itemStyle: { color: "#ff0000", opacity: 1, borderWidth: 1 },
            },
            { id: 3, name: "C", value: [5, 6], label: { show: false } },
            {
              id: 4,
              name: "D",
              value: [7, 8],
              label: { show: true },
              itemStyle: { color: "#00ff00", opacity: 1, borderWidth: 1 },
            },
          ],
          label: {
            formatter: (params) => {
              const p = params as { dataIndex: number };
              formatterCalls.push(p.dataIndex);
              return `dot-${p.dataIndex}`;
            },
          },
          labelLayout: (params) => {
            layoutCalls.push(params.dataIndex ?? -1);
            return { x: 0, y: 0 };
          },
        },
      ],
    };

    const next = gpuScatterOption(option);
    const series = Array.isArray(next.series) ? next.series : [];
    expect(series).toHaveLength(3);
    expect(series[0]).toMatchObject({ type: "line", id: "diag" });
    expect(series[1]).toMatchObject({
      type: "scatter",
      id: "countries",
      symbol: "none",
      silent: true,
      animation: false,
    });

    const labelSeries = series[2] as {
      id: string;
      zlevel: number;
      animationDuration: number;
      data: Array<{ id: number; itemStyle: { opacity: number; borderWidth: number } }>;
      symbolSize: (val: unknown, params: { dataIndex: number }) => number;
      label: { formatter: (params: { dataIndex: number }) => string };
      labelLayout: (params: { dataIndex: number }) => unknown;
    };
    expect(labelSeries.id).toBe("countries/labels");
    expect(labelSeries.zlevel).toBe(1);
    expect(labelSeries.animationDuration).toBe(0);
    expect(labelSeries.data.map((d) => d.id)).toEqual([2, 4]);
    expect(labelSeries.data[0]?.itemStyle).toMatchObject({ opacity: 0, borderWidth: 0 });

    expect(labelSeries.symbolSize([3, 4], { dataIndex: 0 })).toBe(11);
    expect(labelSeries.symbolSize([7, 8], { dataIndex: 1 })).toBe(13);
    expect(sizeCalls).toEqual([1, 3]);

    expect(labelSeries.label.formatter({ dataIndex: 0 })).toBe("dot-1");
    expect(labelSeries.label.formatter({ dataIndex: 1 })).toBe("dot-3");
    expect(formatterCalls).toEqual([1, 3]);

    labelSeries.labelLayout({ dataIndex: 0 });
    labelSeries.labelLayout({ dataIndex: 1 });
    expect(layoutCalls).toEqual([1, 3]);
  });
});

describe("sankeyTransitions", () => {
  it("returns undefined for non-sankey charts and initializes opacity for entering sankey nodes", () => {
    const barChart = {
      getModel: () => ({
        eachSeries: (visit: (series: { subType: string }) => void) => visit({ subType: "bar" }),
      }),
    } as unknown as echarts.ECharts;
    expect(captureSankey(barChart)).toBeUndefined();

    const animateFrom = vi.fn();
    const enteringGraphic: {
      shape: { x: number; y: number };
      style: { opacity?: number };
      stopAnimation: () => void;
      animateFrom: typeof animateFrom;
    } = {
      shape: { x: 10, y: 20 },
      style: {},
      stopAnimation: vi.fn(),
      animateFrom,
    };
    const sankeyChart = {
      getModel: () => ({
        eachSeries: (visit: (series: unknown) => void) =>
          visit({
            id: "s1",
            subType: "sankey",
            getData: (kind?: string) => ({
              count: () => (kind === "edge" ? 0 : 1),
              getId: () => "new-node",
              getRawDataItem: () => ({}),
              getItemGraphicEl: () => enteringGraphic,
            }),
          }),
      }),
    } as unknown as echarts.ECharts;

    animateSankey(sankeyChart, new Map([["s1/node/old-node", { x: 0, y: 0 }]]), 300);
    expect(enteringGraphic.style.opacity).toBe(1);
    expect(animateFrom).toHaveBeenCalledWith(
      { style: { opacity: 0 } },
      expect.objectContaining({ duration: 300 }),
    );
  });
});
