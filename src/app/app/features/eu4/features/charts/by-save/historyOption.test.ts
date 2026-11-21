import { describe, expect, it } from "vitest";
import { dayNumber } from "@/features/timeline/date";
import { valueScale } from "./history";
import {
  historyOption,
  isNoisy,
  lineSeriesIds,
  nearestColumn,
  palettes,
  plotMap,
  seriesIds,
  strength,
} from "./historyOption";
import type { ChartLine, HistoryOptionInput, LineRole } from "./historyOption";

const year = (y: number, month = 1, day = 1) => dayNumber({ year: y, month, day });
const days = [
  year(1502, 8, 2),
  year(1526, 4, 18),
  year(1547, 6, 9),
  year(1580, 10, 21),
  year(1602, 3, 16),
];

const line = (key: string, values: (number | null)[], role: LineRole = "plain"): ChartLine => ({
  key,
  values,
  colors: values.map((v) => (v === null ? null : "#1144cc")),
  names: values.map((v) => (v === null ? null : key)),
  tags: values.map((v) => (v === null ? null : key)),
  changes: [],
  role,
  back: false,
});

const scale = valueScale(0, 2200, true);
const map = plotMap({ left: 46, top: 22, width: 482, height: 360 }, [days[0], days.at(-1)!], scale);
const input = (
  lines: ChartLine[],
  extra: Partial<HistoryOptionInput> = {},
): HistoryOptionInput => ({
  days,
  lines,
  world: false,
  dots: true,
  selected: days.length - 1,
  open: -1,
  map,
  slider: false,
  zoomed: false,
  sparse: true,
  long: (gap) => gap > 5 * 365,
  xLabels: { kind: "saves", columns: [0, 1, 2, 3, 4] },
  yearOf: String,
  palette: palettes.light,
  dark: false,
  tick: String,
  font: "sans-serif",
  height: 440,
  ...extra,
});

type Series = { id: string; data: unknown[]; silent?: boolean; lineStyle?: { type?: unknown } };
const seriesOf = (option: ReturnType<typeof historyOption>) => option.series as Series[];
const points = (series: Series) =>
  series.data.map((x) => (Array.isArray(x) ? x : (x as { value: unknown[] }).value));

describe("historyOption", () => {
  const france = line("FRA", [820, 878, 1162, 1361, 1648], "subject");
  const britain = line("ENG>GBR", [594, 873, 922, 1973, 2017]);

  it("keeps one series order and count whatever is selected or pinned, and names each line's series", () => {
    const rest = seriesOf(historyOption(input([france, britain])));
    const pinned = seriesOf(
      historyOption(input([france, { ...britain, role: "compared" }], { selected: 2 })),
    );
    expect(rest.map((x) => x.id)).toEqual(seriesIds(["FRA", "ENG>GBR"]));
    expect(pinned.map((x) => x.id)).toEqual(rest.map((x) => x.id));
    expect(lineSeriesIds("ENG>GBR").every((id) => rest.some((x) => x.id === id))).toBe(true);
    // The chart draws its own hover, so no series takes pointer events.
    expect(rest.every((x) => x.silent)).toBe(true);
  });

  it("puts the grid and axes where the plot mapping says", () => {
    const option = historyOption(input([france])) as {
      grid: { left: number; top: number; width: number; height: number };
      yAxis: { min: number; max: number };
      dataZoom: { startValue: number; endValue: number }[];
    };
    expect(option.grid).toMatchObject({
      left: map.left,
      top: map.top,
      width: map.width,
      height: map.height,
    });
    expect([option.yAxis.min, option.yAxis.max]).toEqual([map.lo, map.hi]);
    expect([option.dataZoom[0].startValue, option.dataZoom[0].endValue]).toEqual([
      map.from,
      map.to,
    ]);
    expect(map.x(map.from)).toBe(map.left);
    expect(map.y(map.lo)).toBe(map.top + map.height);
  });

  it("keeps every solid point at a save and dots each join over five years", () => {
    const changed = { ...britain, changes: [{ day: year(1563, 1, 20), color: "#cc0000" }] };
    const series = seriesOf(historyOption(input([changed])));
    const past = series.find((x) => x.id === "a:ENG>GBR")!;
    for (const point of points(past)) expect(days).toContain(point[0]);
    // Every join here spans over five years: the solid line is only its dots.
    expect(points(past).filter((p) => p[1] === null)).toHaveLength(4);
    expect(series.find((x) => x.id === "d:ENG>GBR")!.data.length).toBeGreaterThan(0);
  });
});

it("keeps a switch on a saved date in that save's color, and recolors inside a dotted join at the next save", () => {
  const pieces = (day: number) => {
    const option = historyOption(
      input([
        { ...line("CAS>SPA", [500, 600, 700, 800, 900]), changes: [{ day, color: "#ffcc00" }] },
      ]),
    ) as { visualMap: { pieces: { gte: number; lt: number }[] }[] };
    return option.visualMap[0].pieces.map((x) => x.gte);
  };
  // On the 1526 save itself: the cut is there.
  expect(pieces(days[1])).toContain(days[1]);
  // Inside the long 1526 to 1547 join: the cut moves to 1547.
  expect(pieces(year(1530))).toContain(days[2]);
});

describe("strength", () => {
  const dense = {
    sparse: false,
    noisy: false,
    crowded: false,
    pitch: 6,
    anySubject: true,
    world: false,
  };

  it("uses the prototype's weights", () => {
    expect(strength("plain", false, dense)).toEqual({
      width: 1.5,
      join: 0.72,
      dot: 0.75,
      radius: 1.6,
      future: 0.25,
    });
    expect(strength("subject", false, dense)).toMatchObject({
      width: 2.75,
      join: 1,
      radius: 2.9,
      future: 0.34,
    });
    expect(strength("plain", true, dense)).toMatchObject({ join: 0.22, dot: 0.25, future: 0.15 });
    expect(strength("plain", false, { ...dense, noisy: true })).toMatchObject({
      width: 1,
      join: 0.38,
      dot: 0.85,
    });
    expect(strength("plain", false, { ...dense, crowded: true })).toMatchObject({
      width: 1.25,
      join: 0.55,
    });
    expect(strength("plain", false, { ...dense, sparse: true })).toMatchObject({
      width: 1,
      join: 0.5,
      dot: 1,
      radius: 3.4,
    });
    // Without a followed country, sparse lines stay readable.
    expect(strength("plain", false, { ...dense, sparse: true, anySubject: false })).toMatchObject({
      width: 1.5,
      join: 0.75,
    });
  });

  it("dots each save and drops rivals' dots when saves are dense, as in the ledger's density cases", () => {
    expect(strength("plain", false, { ...dense, pitch: 500 / 2 }).radius).toBe(1.6);
    expect(strength("subject", false, { ...dense, pitch: 500 / 82 }).radius).toBe(2.9);
    expect(strength("plain", false, { ...dense, pitch: 500 / 319 }).radius).toBe(0);
    expect(strength("subject", false, { ...dense, pitch: 500 / 319 }).radius).toBe(0);
  });

  it("calls a figure noisy when it reverses at over a quarter of its saves", () => {
    expect(isNoisy([line("a", [1, 5, 2, 6, 3])])).toBe(true);
    expect(isNoisy([line("a", [1, 2, 3, 4, 5])])).toBe(false);
  });
});

it("finds the nearest save among those in view", () => {
  expect(nearestColumn(days, year(1560))).toBe(2);
  expect(nearestColumn(days, year(1560), [year(1570), year(1610)])).toBe(3);
});

describe("the rendered chart", () => {
  it("draws each save where the plot mapping puts it, the overlay's only source of position", async () => {
    const echarts = await import("echarts");
    const france = line("FRA", [820, 878, 1162, 1361, 1648], "subject");
    const option = historyOption(input([france], { sparse: false, long: () => false }));
    const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: 800, height: 440 });
    chart.setOption(option);
    const svg = chart.renderToSVGString();
    chart.dispose();
    // The dots of the earlier part of the line ("a:FRA", the fifth series) carry their centers.
    const index = seriesIds(["FRA"]).indexOf("a:FRA");
    const centers = [
      ...svg.matchAll(/transform="matrix\(([^)]*)\)"[^>]*ecmeta_series_index="(\d+)"/g),
    ]
      .filter((m) => Number(m[2]) === index)
      .map((m) => m[1].split(",").map(Number).slice(4));
    expect(centers).toHaveLength(days.length);
    centers.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(map.x(days[i]), 0);
      expect(y).toBeCloseTo(map.y(france.values[i]!), 0);
    });
  });
});
