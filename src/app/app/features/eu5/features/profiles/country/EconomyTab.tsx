import { useMemo } from "react";
import { formatCompact, formatFloat, formatInt } from "@/lib/format";
import type { CountryOverviewSection, LocationRow } from "@/wasm/wasm_eu5";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { isDarkMode } from "@/lib/dark";
import { getEChartsTheme } from "@/components/viz/echartsTheme";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { useEu5SaveDate } from "../../../store/eu5Store";

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
  const delta = data.income - data.expense;
  const deltaText = `${delta >= 0 ? "+" : ""}${formatCompact(delta, 1)}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-5 overflow-hidden rounded-lg border border-game-line-strong">
        <StatPlate
          label="Gold"
          value={formatCompact(data.gold, 1)}
          delta={{ text: deltaText, positive: delta >= 0 }}
        />
        <StatPlate label="Manpower" value={formatCompact(data.manpower * 1000, 1)} />
        <StatPlate label="Stability" value={formatFloat(data.stability, 1)} />
        <StatPlate label="Prestige" value={formatFloat(data.prestige, 1)} />
        <StatPlate label="Gov. Power" value={formatFloat(data.governmentPower, 1)} />
      </div>

      <RevenueMarginChart revenue={data.monthlyGold} balance={data.recentBalance} />
      <HistoryChart
        title="Tax Base History"
        series={data.historicalTaxBase}
        yLabel="Tax Base"
        isYearly
      />

      <TaxGapScatter locations={locations} />
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
  const isDark = isDarkMode();
  const saveDate = useEu5SaveDate();

  const data = useMemo(
    () => series.map((value, index) => [index - series.length + 1, value]),
    [series],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, labelColor, gridLineColor, tickColor } = getEChartsTheme(isDark);
    const baseYear = saveDate?.year ?? 0;
    const baseMonth = saveDate?.month ?? 1;

    const xFormatter = isYearly
      ? (value: number) => String(baseYear + value)
      : (value: number) => monthOffsetToDate(baseYear, baseMonth, value);

    const tooltipLabel = isYearly
      ? (offset: number) => String(baseYear + offset)
      : (offset: number) => monthOffsetToDate(baseYear, baseMonth, offset);

    return {
      grid: { left: 60, right: 20, top: 16, bottom: 50 },
      xAxis: {
        type: "value",
        nameLocation: "middle",
        nameGap: 34,
        nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
        axisLabel: {
          color: tickColor,
          formatter: xFormatter,
          rotate: isYearly ? 0 : 30,
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.35 } },
        min: "dataMin",
      },
      yAxis: {
        type: "value",
        name: yLabel,
        nameLocation: "middle",
        nameGap: 46,
        nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
        axisLabel: {
          color: tickColor,
          formatter: (value: number) => formatFloat(value, 1),
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5 } },
      },
      tooltip: {
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
          lineStyle: { color: isDark ? "#60a5fa" : "#2563eb", width: 2 },
          areaStyle: { color: isDark ? "rgba(96,165,250,0.12)" : "rgba(37,99,235,0.14)" },
        },
      ],
    };
  }, [data, isDark, isYearly, saveDate, yLabel]);

  if (series.length < 2) return null;

  return (
    <section>
      <p className="mb-2 text-[10px] font-semibold tracking-widest text-game-ink-500 uppercase">
        {title}
      </p>
      <EChart option={option} style={{ height: "200px", width: "100%" }} />
    </section>
  );
}

function RevenueMarginChart({ revenue, balance }: { revenue: number[]; balance: number[] }) {
  const isDark = isDarkMode();
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
    const { axisColor, labelColor, gridLineColor, tickColor } = getEChartsTheme(isDark);

    return {
      grid: { left: 68, right: 72, top: 16, bottom: 50 },
      xAxis: {
        type: "category",
        data: categories,
        axisLabel: {
          color: tickColor,
          rotate: 30,
          interval: "auto",
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.35 } },
      },
      yAxis: [
        {
          type: "value",
          name: "Revenue",
          nameLocation: "middle",
          nameGap: 38,
          nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
          min: leftMin,
          max: leftMax,
          axisLabel: {
            color: tickColor,
            // hide the artificial negative labels introduced for zero alignment
            formatter: (value: number) => (value < 0 ? "" : formatInt(value)),
          },
          axisLine: { lineStyle: { color: axisColor } },
          splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5 } },
        },
        {
          type: "value",
          name: "Net Margin %",
          nameLocation: "middle",
          nameGap: 44,
          nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
          min: rightMin,
          max: rightMax,
          axisLabel: {
            color: tickColor,
            formatter: (value: number) => `${formatInt(value)}%`,
          },
          axisLine: { lineStyle: { color: axisColor } },
          splitLine: { show: false },
        },
      ],
      tooltip: {
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
          type: "bar",
          data: barData,
          yAxisIndex: 0,
          itemStyle: { color: isDark ? "#60a5fa" : "#2563eb", opacity: 0.7 },
        },
        {
          type: "line",
          data: lineData,
          yAxisIndex: 1,
          symbol: "none",
          smooth: true,
          lineStyle: { color: isDark ? "#fb923c" : "#ea580c", width: 2 },
          markLine: {
            silent: true,
            symbol: "none",
            data: [{ yAxis: 0 }],
            lineStyle: { type: "dashed", color: isDark ? "#94a3b8" : "#64748b", width: 1 },
            label: { show: false },
          },
        },
      ],
    };
  }, [categories, barData, lineData, leftMin, leftMax, rightMin, rightMax, isDark]);

  if (n < 2) return null;

  return (
    <section>
      <p className="mb-2 text-[10px] font-semibold tracking-widest text-game-ink-500 uppercase">
        Revenue &amp; Net Margin
      </p>
      <EChart option={option} style={{ height: "200px", width: "100%" }} />
    </section>
  );
}

function TaxGapScatter({ locations }: { locations: LocationRow[] }) {
  const isDark = isDarkMode();

  const eligible = useMemo(() => locations.filter((r) => r.possibleTax > 0), [locations]);

  const scatterData = useMemo(
    (): [number, number][] => eligible.map((r) => [r.possibleTax, r.tax]),
    [eligible],
  );

  const diagonalMax = useMemo(() => {
    const max = Math.max(...eligible.map((r) => r.possibleTax));
    return max > 0 ? max : 1;
  }, [eligible]);

  const option = useMemo((): EChartsOption => {
    const { axisColor, labelColor, gridLineColor, tickColor } = getEChartsTheme(isDark);
    return {
      grid: { left: 70, right: 20, top: 16, bottom: 50 },
      xAxis: {
        type: "value",
        name: "Possible Tax",
        nameLocation: "middle",
        nameGap: 36,
        nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
        axisLabel: { color: tickColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5 } },
        min: 0,
      },
      yAxis: {
        type: "value",
        name: "Actual Tax",
        nameLocation: "middle",
        nameGap: 52,
        nameTextStyle: { color: labelColor, fontSize: 11, fontWeight: 600 },
        axisLabel: { color: tickColor },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5 } },
        min: 0,
      },
      tooltip: {
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) return "";
          const d = eligible[params.dataIndex ?? -1];
          if (!d) return "";
          const gap = d.possibleTax - d.tax;
          const realization = d.possibleTax > 0 ? (d.tax / d.possibleTax) * 100 : 100;
          return [
            `<strong>${escapeEChartsHtml(d.name)}</strong>`,
            `Possible Tax: ${formatFloat(d.possibleTax, 2)}`,
            `Actual Tax: ${formatFloat(d.tax, 2)}`,
            `Gap: ${formatFloat(gap, 2)}`,
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
          lineStyle: { type: "dashed", color: isDark ? "#475569" : "#94a3b8", width: 1 },
          symbol: "none",
          silent: true,
          tooltip: { show: false },
        },
        {
          type: "scatter",
          data: scatterData,
          symbolSize: 6,
          itemStyle: { color: isDark ? "#93c5fd" : "#3b82f6", opacity: 0.8 },
        },
      ],
    };
  }, [scatterData, diagonalMax, isDark, eligible]);

  if (eligible.length < 2) return null;

  return (
    <section>
      <p className="mb-2 text-[10px] font-semibold tracking-widest text-game-ink-500 uppercase">
        Tax Gap · Possible vs Actual
      </p>
      <EChart option={option} style={{ height: "300px", width: "100%" }} />
    </section>
  );
}

function StatPlate({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: { text: string; positive: boolean };
}) {
  return (
    <div className="min-w-0 overflow-hidden border-r border-game-line bg-game-panel px-3 py-3 last:border-r-0">
      <div className="mb-1.5 truncate font-mono text-[10px] tracking-[0.14em] text-game-ink-500 uppercase">
        {label}
      </div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1 font-mono text-[18px] font-medium tracking-[-0.01em] text-game-ink-100 tabular-nums">
        <span className="truncate">{value}</span>
        {delta && (
          <span
            className={`shrink-0 text-[10px] ${delta.positive ? "text-game-good" : "text-game-err"}`}
          >
            {delta.text}
          </span>
        )}
      </div>
    </div>
  );
}
