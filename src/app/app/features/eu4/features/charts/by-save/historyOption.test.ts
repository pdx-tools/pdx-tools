import { describe, expect, it } from "vitest";
import { dayNumber } from "@/features/timeline/date";
import { valueScale } from "./history";
import { dotRadius, historyOption, nearestColumn, palettes, seriesIds } from "./historyOption";
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
  changes: [],
  role,
  back: false,
});

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
  view: [days[0], days.at(-1)!],
  slider: false,
  scale: valueScale(0, 2200, true),
  grid: { left: 46, right: 272, top: 22, height: 360 },
  fan: 40,
  plotWidth: 482,
  sparse: true,
  long: () => false,
  xLabels: { kind: "saves", columns: [0, 1, 2, 3, 4] },
  yearOf: String,
  dateOf: String,
  leaders: null,
  comparison: null,
  palette: palettes.light,
  dark: false,
  format: String,
  tick: String,
  font: "sans-serif",
  ...extra,
});

type Series = { id: string; data: unknown[]; markPoint?: { data: { name: string }[] } };
const seriesOf = (option: ReturnType<typeof historyOption>) => option.series as Series[];

describe("historyOption", () => {
  const france = line("FRA", [820, 878, 1162, 1361, 1648], "subject");
  const britain = line("ENG>GBR", [594, 873, 922, 1973, 2017]);

  it("keeps one series order and count whatever is pointed at or pinned", () => {
    const rest = seriesOf(historyOption(input([france, britain])));
    const compared = { ...britain, role: "compared" as const };
    const pointed = seriesOf(
      historyOption(
        input([france, compared], {
          comparison: { subject: france, rival: compared, since: 3 },
          selected: 2,
        }),
      ),
    );
    expect(rest.map((x) => x.id)).toEqual(seriesIds(["FRA", "ENG>GBR"]));
    expect(pointed.map((x) => x.id)).toEqual(rest.map((x) => x.id));
  });

  it("rings the subject where the present order with the compared country began", () => {
    const compared = { ...britain, role: "compared" as const };
    const series = seriesOf(
      historyOption(
        input([france, compared], { comparison: { subject: france, rival: compared, since: 3 } }),
      ),
    );
    const past = series.find((x) => x.id === "a:FRA")!;
    expect(past.markPoint?.data.map((x) => x.name)).toEqual(["since"]);
    // A stick at each save where the two differ.
    expect(series.find((x) => x.id === "sticks")!.data).toHaveLength(5);
  });

  it("keeps every hovered point at a save, and breaks a sparse join where the tag changes", () => {
    const changed = { ...britain, changes: [{ day: year(1563, 1, 20), color: "#cc0000" }] };
    const series = seriesOf(historyOption(input([changed], { long: (gap) => gap > 30 * 365 })));
    const past = series.find((x) => x.id === "a:ENG>GBR")!;
    const points = past.data.map((x) => (Array.isArray(x) ? x : (x as { value: unknown[] }).value));
    for (const point of points) expect(days).toContain(point[0]);
    // The long 1547 to 1580 join is dotted: a gap in the solid line.
    expect(points.some((x) => x[1] === null)).toBe(true);
    const dense = seriesOf(historyOption(input([changed])));
    expect(dense.find((x) => x.id === "breaks")!.data).toHaveLength(1);
  });

  it("dots each save and keeps dense saves light, as in the density cases of the ledger", () => {
    // Three saves over 500 px, 83 yearly saves, and 320 monthly saves.
    expect(dotRadius("plain", 500 / 2, false)).toBe(1.6);
    expect(dotRadius("subject", 500 / 82, false)).toBe(2.9);
    expect(dotRadius("plain", 500 / 82, false)).toBe(1.6);
    expect(dotRadius("plain", 500 / 319, false)).toBe(0);
    expect(dotRadius("subject", 500 / 319, false)).toBe(0);
    expect(dotRadius("plain", 30, true)).toBeGreaterThan(3);
  });

  it("finds the nearest save among those in view", () => {
    expect(nearestColumn(days, year(1560))).toBe(2);
    expect(nearestColumn(days, year(1560), [year(1570), year(1610)])).toBe(3);
  });
});
