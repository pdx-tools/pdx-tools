import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { HistoryLine } from "./HistoryChart";

const charts = vi.hoisted(() => [] as { title: string; lines: HistoryLine[]; inverse?: boolean }[]);
vi.mock("./HistoryChart", () => ({
  HistoryChart: (props: { title: string; lines: HistoryLine[]; inverse?: boolean }) => {
    charts.push({ title: props.title, lines: props.lines, inverse: props.inverse });
    return <div>{props.title}</div>;
  },
}));

import { ContextGraphs } from "./ContextGraphs";

const dates = [
  { id: "a", date: "1337-04-01", campaignId: "c", gameVersion: "1.4", contentHash: "h1" },
  { id: "b", date: "1350-01-01", campaignId: "c", gameVersion: "1.4", contentHash: "h2" },
];

beforeEach(() => {
  charts.length = 0;
});

it("computes derived control ratios and differences from narrow series", () => {
  renderToStaticMarkup(
    <ContextGraphs
      dates={dates}
      mode="control"
      countryId={7}
      countryName="Poland"
      data={{
        metrics: {
          development: [100, null],
          effectiveDevelopment: [75, null],
        },
        breakdown: [],
      }}
    />,
  );
  expect(charts).toEqual([
    {
      title: "Development weighted control",
      lines: [{ name: "Poland", raw: [75, null] }],
    },
    {
      title: "Development lost to control",
      lines: [{ name: "Poland", raw: [25, null] }],
    },
  ]);
});

it("ranks the six largest faith series and computes faith composition percentages", () => {
  renderToStaticMarkup(
    <ContextGraphs
      dates={dates}
      mode="religion"
      data={{
        metrics: { population: [200, 400] },
        breakdown: [
          { key: "catholic", values: [150, 300] },
          { key: "orthodox", values: [50, 100] },
        ],
      }}
    />,
  );
  expect(charts).toEqual([
    {
      title: "Population by faith",
      lines: [
        { name: "Catholic", raw: [150, 300] },
        { name: "Orthodox", raw: [50, 100] },
      ],
    },
    {
      title: "Faith composition",
      lines: [
        { name: "Catholic", raw: [75, 75] },
        { name: "Orthodox", raw: [25, 25] },
      ],
    },
  ]);
});

it("shows great power rank inverted only for a focused country", () => {
  renderToStaticMarkup(
    <ContextGraphs
      dates={dates}
      mode="political"
      countryId={7}
      countryName="Poland"
      data={{
        metrics: {
          population: [100, 120],
          stateCapacity: [50, 60],
          income: [10, 12],
          greatPowerRank: [null, 4],
        },
        breakdown: [],
      }}
    />,
  );
  expect(charts.find((c) => c.title === "Great power rank")).toEqual({
    title: "Great power rank",
    inverse: true,
    lines: [{ name: "Poland", raw: [null, 4] }],
  });
});

it("omits breakdown chart cards when no breakdown series exist", () => {
  renderToStaticMarkup(
    <ContextGraphs
      dates={dates}
      mode="religion"
      data={{
        metrics: { population: [200, 400] },
        breakdown: [],
      }}
    />,
  );
  expect(charts).toEqual([]);
});
