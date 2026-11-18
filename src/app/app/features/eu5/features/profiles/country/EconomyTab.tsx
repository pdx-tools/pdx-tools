import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  formatExact,
  formatPercent,
  formatPercentTick,
  formatTick,
} from "../../../numberFormatting";
import { Figure } from "../../../components/Figure";
import type { CountryOverviewSection, LocationRow } from "@/wasm/wasm_eu5";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import {
  chartInk,
  chartTooltip,
  neutralFill,
  neutralMark,
  seriesColor,
  yAxisName,
} from "@/components/viz/echartsTheme";
import { useEu5SaveDate } from "../../../store/eu5Store";
import { SectionTitle, StatRail } from "../../../components";

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

export function CountryOverviewTabContent({
  data,
  locations,
}: {
  data: CountryOverviewSection;
  locations: LocationRow[];
}) {
  const { ranks } = data;
  const standing = (metric: keyof CountryOverviewSection["ranks"]["ties"]) => ({
    rank: ranks[metric],
    tied: ranks.ties[metric],
  });
  return (
    <div className="flex flex-col gap-4">
      <StatRail title="Overview" cohort={ranks.cohort}>
        <StatRail.Section label="Economy" heads />
        <StatRail.Row
          label="Net Gold"
          value={<Figure value={data.netGold} />}
          bar={data.netGoldMax > 0 ? data.netGold / data.netGoldMax : undefined}
          {...standing("netGold")}
        />
        <StatRail.Row
          label="Income"
          value={<Figure value={data.income} />}
          bar={data.incomeMax > 0 ? data.income / data.incomeMax : undefined}
          {...standing("income")}
        />
        <StatRail.Row label="Expense" value={<Figure value={data.expense} />} />
        <StatRail.Row
          label="Wealth"
          value={<Figure value={data.wealth} />}
          bar={data.wealthMax > 0 ? data.wealth / data.wealthMax : undefined}
          {...standing("wealth")}
        />
        <StatRail.Row
          label="Tax Base"
          value={<Figure value={data.taxBase} />}
          bar={data.taxBaseMax > 0 ? data.taxBase / data.taxBaseMax : undefined}
          {...standing("taxBase")}
        />
        <StatRail.Row
          label="Buildings"
          value={<Figure value={data.buildingLevels} form="level" />}
          bar={
            data.buildingLevelsMax > 0 ? data.buildingLevels / data.buildingLevelsMax : undefined
          }
          {...standing("buildingLevels")}
        />

        <StatRail.Section label="Society" />
        <StatRail.Row
          label="Population"
          value={<Figure value={data.totalPopulation} form="count" />}
          bar={
            data.totalPopulationMax > 0 ? data.totalPopulation / data.totalPopulationMax : undefined
          }
          {...standing("totalPopulation")}
        />
        <StatRail.Row
          label="Manpower"
          value={<Figure value={data.manpower * 1000} form="count" />}
          bar={data.manpowerMax > 0 ? data.manpower / data.manpowerMax : undefined}
          {...standing("manpower")}
        />

        <StatRail.Section label="State" />
        <StatRail.Row
          label="Effective Development"
          tooltip="Effective Development: sum of control × development across owned locations."
          value={<Figure value={data.effectiveDevelopment} />}
          bar={
            data.effectiveDevelopmentMax > 0
              ? data.effectiveDevelopment / data.effectiveDevelopmentMax
              : undefined
          }
          {...standing("effectiveDevelopment")}
        />
        <StatRail.Row
          label="Active State Capacity"
          tooltip="Active State Capacity: sum of population × control × development across owned locations."
          value={<Figure value={data.activeStateCapacity} />}
          bar={
            data.activeStateCapacityMax > 0
              ? data.activeStateCapacity / data.activeStateCapacityMax
              : undefined
          }
          {...standing("activeStateCapacity")}
        />
        <StatRail.Row
          label="Stability"
          value={<Figure value={data.stability} />}
          bar={(data.stability + 100) / 200}
          {...standing("stability")}
        />
        <StatRail.Row
          label="Prestige"
          value={<Figure value={data.prestige} />}
          bar={data.prestige / 100}
          {...standing("prestige")}
        />
        <StatRail.Row
          label="Gov. Power"
          value={<Figure value={data.governmentPower} />}
          bar={data.governmentPower / 100}
          {...standing("governmentPower")}
        />
      </StatRail>

      <RevenueMarginChart revenue={data.monthlyGold} balance={data.recentBalance} />
      <HistoryChart
        title="Tax Base History"
        series={data.historicalTaxBase}
        yLabel="Tax Base"
        isYearly
      />

      <UnrealizedTaxBaseScatter locations={locations} />
    </div>
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
    const baseYear = saveDate?.year ?? 0;
    const baseMonth = saveDate?.month ?? 1;

    const xFormatter = isYearly
      ? (value: number) => String(baseYear + value)
      : (value: number) => monthOffsetToDate(baseYear, baseMonth, value);

    const tooltipLabel = isYearly
      ? (offset: number) => String(baseYear + offset)
      : (offset: number) => monthOffsetToDate(baseYear, baseMonth, offset);

    return {
      grid: { left: 60, right: 20, top: 32, bottom: 50 },
      xAxis: {
        type: "value",
        axisLabel: {
          formatter: xFormatter,
          rotate: isYearly ? 0 : 30,
        },
        min: "dataMin",
      },
      yAxis: {
        type: "value",
        ...yAxisName(yLabel),
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
          return `<strong>${tooltipLabel(offset)}</strong><br/>${yLabel}: ${formatExact(v)}`;
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
    return {
      grid: { left: 68, right: 72, top: 32, bottom: 62 },
      legend: {
        bottom: 0,
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 14,
      },
      xAxis: {
        type: "category",
        data: categories,
        axisLabel: { rotate: 30, interval: "auto" },
      },
      yAxis: [
        {
          type: "value",
          ...yAxisName("Revenue"),
          min: leftMin,
          max: leftMax,
          axisLabel: {
            // hide the artificial negative labels introduced for zero alignment
            formatter: (value: number) => (value < 0 ? "" : formatTick(value)),
          },
        },
        {
          type: "value",
          ...yAxisName("Net Margin %", "right"),
          min: rightMin,
          max: rightMax,
          axisLabel: {
            formatter: (value: number) => formatPercentTick(value / 100),
          },
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
            `Revenue: ${formatExact(rev)}`,
            `Net Margin: ${formatPercent(pct / 100)}`,
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
    return {
      grid: { left: 56, right: 20, top: 32, bottom: 50 },
      xAxis: {
        type: "value",
        name: "Wealth",
        nameLocation: "middle",
        nameGap: 36,
        min: 0,
      },
      yAxis: {
        type: "value",
        ...yAxisName("Tax Base"),
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
          const realization = d.wealth > 0 ? d.taxBase / d.wealth : 1;
          return [
            `<strong>${escapeEChartsHtml(d.location.name)}</strong>`,
            `Wealth: ${formatExact(d.wealth)}`,
            `Tax Base: ${formatExact(d.taxBase)}`,
            `Tax Base Gap: ${formatExact(gap)}`,
            `Realization: ${formatPercent(realization)}`,
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
          itemStyle: { color: neutralMark, opacity: 0.8 },
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
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1 font-game-num text-[18px] font-medium tracking-[-0.01em] text-game-ink-100 tabular-nums">
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
