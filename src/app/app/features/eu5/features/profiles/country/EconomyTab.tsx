import { useMemo } from "react";
import type { ReactNode } from "react";
import { cx } from "class-variance-authority";
import {
  formatTick,
  formatCount,
  formatExact,
  formatFloat,
  formatInt,
  formatMetric,
  formatScale,
} from "@/lib/format";
import type { CountryOverviewSection, LocationRow, MapMode } from "@/wasm/wasm_eu5";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import {
  chartGutter,
  chartInk,
  chartTooltip,
  getEChartsTheme,
  seriesColor,
  neutralFill,
  neutralMark,
  dotRim,
  yAxisName,
} from "@/components/viz/echartsTheme";
import { useEu5SaveDate } from "../../../store/eu5Store";
import { SectionTitle, StatRail } from "../../../components";
import { roundYearOffsets } from "../../insights/histogramAxis";
import { levelBody } from "../../../stack/levelBody";
import { MapModeLabel } from "../../../stack/parts";
import { rankPosition } from "../../../stack/selection";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function monthOffsetToDate(baseYear: number, baseMonth: number, offset: number): string {
  const totalMonths = baseYear * 12 + (baseMonth - 1) + offset;
  const year = Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12;
  return `${year} ${MONTH_NAMES[month]}`;
}

export type OverviewFigure = {
  label: string;
  /** The figure as a plain number, when it is compact. A row of a table then has one unit. */
  shown?: (d: CountryOverviewSection) => number;
  /** The map mode that shows this figure, if one does */
  mode?: MapMode;
  tooltip?: string;
  /** The figure can go under zero, so a bar of it needs a zero mark */
  signed?: boolean;
  value: (d: CountryOverviewSection) => string;
  /** The amount behind the figure, for its full value and for a bar */
  amount: (d: CountryOverviewSection) => number;
  rank?: (d: CountryOverviewSection) => number;
};

/** The overview figures, in sections. The Compare level shows the same rows. */
export const OVERVIEW: { section: string; figures: OverviewFigure[] }[] = [
  {
    section: "Economy",
    figures: [
      {
        label: "Net Gold",
        signed: true,
        shown: (d) => d.netGold,
        value: (d) => formatMetric(d.netGold),
        amount: (d) => d.netGold,
        rank: (d) => d.ranks.netGold,
      },
      {
        label: "Income",
        shown: (d) => d.income,
        value: (d) => formatMetric(d.income),
        amount: (d) => d.income,
        rank: (d) => d.ranks.income,
      },
      {
        label: "Expense",
        // A large state spends more, so a low expense is not better in itself and
        // the game ranks no country by it. Net Gold compares it with the income.
        tooltip:
          "Has no rank and no best value: a large state spends more. Net Gold compares it with income.",
        shown: (d) => d.expense,
        value: (d) => formatMetric(d.expense),
        amount: (d) => d.expense,
      },
      {
        label: "Wealth",
        mode: "wealth",
        shown: (d) => d.wealth,
        value: (d) => formatMetric(d.wealth),
        amount: (d) => d.wealth,
        rank: (d) => d.ranks.wealth,
      },
      {
        label: "Tax Base",
        shown: (d) => d.taxBase,
        value: (d) => formatMetric(d.taxBase),
        amount: (d) => d.taxBase,
        rank: (d) => d.ranks.taxBase,
      },
      {
        label: "Buildings",
        mode: "buildingLevels",
        shown: (d) => d.buildingLevels,
        value: (d) => formatCount(d.buildingLevels),
        amount: (d) => d.buildingLevels,
        rank: (d) => d.ranks.buildingLevels,
      },
    ],
  },
  {
    section: "Society",
    figures: [
      {
        label: "Population",
        mode: "population",
        shown: (d) => d.totalPopulation,
        value: (d) => formatCount(d.totalPopulation),
        amount: (d) => d.totalPopulation,
        rank: (d) => d.ranks.totalPopulation,
      },
      {
        label: "Manpower",
        shown: (d) => d.manpower * 1000,
        value: (d) => formatCount(d.manpower * 1000),
        amount: (d) => d.manpower * 1000,
        rank: (d) => d.ranks.manpower,
      },
    ],
  },
  {
    section: "State",
    figures: [
      {
        label: "Eff. Dev",
        mode: "stateEfficacy",
        tooltip: "Effective Development: sum of control × development across owned locations.",
        shown: (d) => d.effectiveDevelopment,
        value: (d) => formatMetric(d.effectiveDevelopment),
        amount: (d) => d.effectiveDevelopment,
        rank: (d) => d.ranks.effectiveDevelopment,
      },
      {
        label: "Capacity",
        tooltip:
          "Active State Capacity: sum of population × control × development across owned locations.",
        shown: (d) => d.activeStateCapacity,
        value: (d) => formatMetric(d.activeStateCapacity),
        amount: (d) => d.activeStateCapacity,
        rank: (d) => d.ranks.activeStateCapacity,
      },
      {
        label: "Stability",
        signed: true,
        value: (d) => formatScale(d.stability),
        amount: (d) => d.stability,
        rank: (d) => d.ranks.stability,
      },
      {
        label: "Prestige",
        value: (d) => formatScale(d.prestige),
        amount: (d) => d.prestige,
        rank: (d) => d.ranks.prestige,
      },
      {
        label: "Gov. Power",
        value: (d) => formatScale(d.governmentPower),
        amount: (d) => d.governmentPower,
        rank: (d) => d.ranks.governmentPower,
      },
    ],
  },
];

export function CountryOverviewTabContent({
  data,
  locations,
}: {
  data: CountryOverviewSection;
  locations: LocationRow[];
}) {
  return (
    <>
      <StatRail>
        {OVERVIEW.flatMap(({ section, figures }) => [
          <StatRail.Section
            key={section}
            label={section}
            axis={[
              { label: "#100", at: rankPosition(100, data.ranks.cohort) },
              { label: "#10", at: rankPosition(10, data.ranks.cohort) },
              { label: "#1", at: 1 },
            ]}
          />,
          ...figures.map((f) => {
            const rank = f.rank?.(data);
            return (
              <StatRail.Row
                key={f.label}
                label={f.mode ? <MapModeLabel mode={f.mode} label={f.label} /> : f.label}
                tooltip={f.tooltip}
                value={f.value(data)}
                exact={formatExact(f.amount(data))}
                percentile={rank !== undefined ? rankPosition(rank, data.ranks.cohort) : undefined}
                ticks={[rankPosition(100, data.ranks.cohort), rankPosition(10, data.ranks.cohort)]}
                rank={rank}
              />
            );
          }),
        ])}
      </StatRail>

      <div className={cx(levelBody, "flex flex-col gap-4")}>
        <RevenueMarginChart revenue={data.monthlyGold} balance={data.recentBalance} />
        <HistoryChart
          title="Tax Base History"
          series={data.historicalTaxBase}
          yLabel="Tax Base"
          isYearly
        />

        <UnrealizedTaxBaseScatter locations={locations} />
      </div>
    </>
  );
}

function HistoryChart({
  title,
  series,
  yLabel,
  isYearly = false,
}: {
  title: string;
  series: number[];
  yLabel: string;
  isYearly?: boolean;
}) {
  const saveDate = useEu5SaveDate();

  const data = useMemo(
    () => series.map((value, index) => [index - series.length + 1, value]),
    [series],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();
    const baseYear = saveDate?.year ?? 0;
    const baseMonth = saveDate?.month ?? 1;

    const xFormatter = isYearly
      ? (value: number) => String(baseYear + value)
      : (value: number) => monthOffsetToDate(baseYear, baseMonth, value);

    const tooltipLabel = isYearly
      ? (offset: number) => String(baseYear + offset)
      : (offset: number) => monthOffsetToDate(baseYear, baseMonth, offset);

    const firstOffset = data.length > 0 ? (data[0] as number[])[0] : 0;
    const yearTicks = isYearly ? roundYearOffsets(firstOffset, baseYear) : undefined;

    return {
      // The section title names the quantity, so the chart has no axis name.
      grid: { ...chartGutter, top: 12, bottom: 24 },
      xAxis: {
        type: "value",
        axisLabel: {
          color: tickColor,
          fontSize: 12,
          customValues: yearTicks,
          formatter: xFormatter,
          hideOverlap: true,
        },
        axisTick: { customValues: yearTicks },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.35 } },
        min: "dataMin",
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: tickColor,
          fontSize: 12,
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5 } },
      },
      tooltip: {
        ...chartTooltip,
        trigger: "axis",
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          const value = arr[0]?.value;
          if (!Array.isArray(value)) return "";
          const offset = Number(value[0]);
          const v = Number(value[1]);
          return `<strong>${tooltipLabel(offset)}</strong><br/>${yLabel}: ${formatFloat(v, 2)}`;
        },
      },
      series: [
        {
          type: "line",
          data,
          symbol: "none",
          smooth: true,
          lineStyle: { color: neutralMark, width: 2 },
          areaStyle: { color: neutralFill },
        },
      ],
    };
  }, [data, isYearly, saveDate, yLabel]);

  if (series.length < 2) return null;

  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <EChart option={option} style={{ height: "200px", width: "100%" }} />
    </section>
  );
}

function RevenueMarginChart({ revenue, balance }: { revenue: number[]; balance: number[] }) {
  const saveDate = useEu5SaveDate();
  const n = Math.min(revenue.length, balance.length);

  const { categories, barData, lineData, leftMin, leftMax, rightMin, rightMax } = useMemo(() => {
    const revSlice = revenue.slice(revenue.length - n);
    const balSlice = balance.slice(balance.length - n);
    const baseYear = saveDate?.year ?? 0;
    const baseMonth = saveDate?.month ?? 1;

    const cats = revSlice.map((_, i) => monthOffsetToDate(baseYear, baseMonth, i - n + 1));
    const pcts = revSlice.map((rev, i) => {
      const bal = balSlice[i] ?? 0;
      return rev !== 0 ? (bal / rev) * 100 : 0;
    });

    const revMax = Math.max(...revSlice, 1);
    const mgnMax = Math.max(...pcts, 0);
    const mgnMin = Math.min(...pcts, 0);

    // Align zeros only when data actually goes negative
    const totalRange = mgnMax - mgnMin;
    const f = mgnMin < 0 && totalRange > 0 ? -mgnMin / totalRange : 0;
    const leftMin = f > 0 && f < 1 ? -(f * revMax) / (1 - f) : 0;

    return {
      categories: cats,
      barData: revSlice,
      lineData: pcts,
      leftMin,
      leftMax: revMax,
      rightMin: mgnMin,
      rightMax: mgnMax,
    };
  }, [revenue, balance, n, saveDate]);

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();

    // The profile is narrow, so the legend names the two axes and the ticks
    // are short. Axis titles and rotated dates would take half the width.
    return {
      grid: { left: chartGutter.left, right: 44, top: 28, bottom: 24 },
      legend: {
        top: 0,
        left: 0,
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 14,
        textStyle: { color: tickColor, fontSize: 12 },
      },
      xAxis: {
        type: "category",
        data: categories,
        axisLabel: {
          color: tickColor,
          fontSize: 12,
          interval: "auto",
          hideOverlap: true,
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.35 } },
      },
      yAxis: [
        {
          type: "value",
          min: leftMin,
          max: leftMax,
          axisLabel: {
            color: tickColor,
            fontSize: 12,
            // hide the artificial negative labels introduced for zero alignment
            formatter: (value: number) => (value < 0 ? "" : formatTick(value)),
          },
          axisLine: { lineStyle: { color: axisColor } },
          splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5 } },
        },
        {
          type: "value",
          min: rightMin,
          max: rightMax,
          axisLabel: {
            color: tickColor,
            fontSize: 12,
            formatter: (value: number) => `${formatInt(value)}%`,
          },
          axisLine: { lineStyle: { color: axisColor } },
          splitLine: { show: false },
        },
      ],
      tooltip: {
        ...chartTooltip,
        trigger: "axis",
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          const dateLabel = arr[0]?.name ?? "";
          const rev = Number(arr[0]?.value ?? 0);
          const pct = Number(arr[1]?.value ?? 0);
          return [
            `<strong>${dateLabel}</strong>`,
            `Revenue: ${formatFloat(rev, 2)}`,
            `Net Margin: ${formatFloat(pct, 1)}%`,
          ].join("<br/>");
        },
      },
      series: [
        {
          name: "Revenue",
          type: "bar",
          data: barData,
          yAxisIndex: 0,
          itemStyle: { color: seriesColor(0), opacity: 0.7 },
        },
        {
          name: "Net Margin %",
          type: "line",
          data: lineData,
          yAxisIndex: 1,
          symbol: "none",
          smooth: true,
          // ECharts derives the legend swatch from `color`, not `lineStyle`.
          color: seriesColor(1),
          lineStyle: { color: seriesColor(1), width: 2 },
          markLine: {
            silent: true,
            symbol: "none",
            animation: false,
            data: [{ yAxis: 0 }],
            lineStyle: { type: "dashed", color: chartInk.muted, width: 1 },
            label: { show: false },
          },
        },
      ],
    };
  }, [categories, barData, lineData, leftMin, leftMax, rightMin, rightMax]);

  if (n < 2) return null;

  return (
    <section>
      <SectionTitle>Revenue &amp; Net Margin</SectionTitle>
      <EChart option={option} style={{ height: "200px", width: "100%" }} />
    </section>
  );
}

function UnrealizedTaxBaseScatter({ locations }: { locations: LocationRow[] }) {
  const eligible = useMemo(() => locations.filter((r) => r.wealth > 0), [locations]);

  const scatterData = useMemo(
    (): [number, number][] => eligible.map((r) => [r.wealth, r.taxBase]),
    [eligible],
  );

  const diagonalMax = useMemo(() => {
    const max = Math.max(...eligible.map((r) => r.wealth));
    return max > 0 ? max : 1;
  }, [eligible]);

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();
    return {
      grid: { ...chartGutter, top: 28, bottom: 50 },
      xAxis: {
        type: "value",
        name: "Wealth",
        nameLocation: "middle",
        nameGap: 36,
        nameTextStyle: { color: tickColor, fontSize: 12 },
        axisLabel: { color: tickColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5 } },
        min: 0,
      },
      yAxis: {
        type: "value",
        ...yAxisName("Tax Base"),
        axisLabel: { color: tickColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5 } },
        min: 0,
      },
      tooltip: {
        ...chartTooltip,
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) return "";
          const d = eligible[params.dataIndex ?? -1];
          if (!d) return "";
          const gap = d.wealth - d.taxBase;
          const realization = d.wealth > 0 ? (d.taxBase / d.wealth) * 100 : 100;
          return [
            `<strong>${escapeEChartsHtml(d.location.name)}</strong>`,
            `Wealth: ${formatFloat(d.wealth, 2)}`,
            `Tax Base: ${formatFloat(d.taxBase, 2)}`,
            `Tax Base Gap: ${formatFloat(gap, 2)}`,
            `Realization: ${formatFloat(realization, 1)}%`,
          ].join("<br/>");
        },
      },
      series: [
        {
          type: "line",
          data: [
            [0, 0],
            [diagonalMax, diagonalMax],
          ],
          lineStyle: { type: "dashed", color: chartInk.muted, width: 1 },
          symbol: "none",
          silent: true,
          tooltip: { show: false },
        },
        {
          type: "scatter",
          data: scatterData,
          symbolSize: 6,
          itemStyle: {
            ...dotRim,
            color: neutralMark,
            opacity: 0.7,
          },
        },
      ],
    };
  }, [scatterData, diagonalMax, eligible]);

  if (eligible.length < 2) return null;

  return (
    <section>
      <SectionTitle>Tax Base Gap · Wealth vs Tax Base</SectionTitle>
      <EChart option={option} style={{ height: "300px", width: "100%" }} />
    </section>
  );
}

export function StatPlate({
  label,
  value,
  delta,
}: {
  label: string;
  value: ReactNode;
  delta?: { text: string; positive: boolean };
}) {
  return (
    <div className="min-w-0 border-r border-game-line bg-game-panel px-3 py-3 last:border-r-0">
      <SectionTitle className="mb-1.5 truncate">{label}</SectionTitle>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1 font-game-num text-[20px] font-medium text-game-ink-100 tabular-nums">
        {typeof value === "string" ? <span className="truncate">{value}</span> : value}
        {delta && (
          <span
            className={`shrink-0 text-[12px] ${delta.positive ? "text-game-good" : "text-game-err"}`}
          >
            {delta.text}
          </span>
        )}
      </div>
    </div>
  );
}
