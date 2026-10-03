import { useMemo } from "react";
import type { Vic3GraphData } from "./worker/types";
import { formatFloat } from "@/lib/format";
import { isDarkMode } from "@/lib/dark";
import type { EChartsOption } from "@/components/viz/EChart";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { EChart } from "@/components/viz/EChart";

export interface CountryChartProps {
  stats: Vic3GraphData[];
  type: "gdp" | "gdpc";
}

const typeMap = {
  gdp: "GDP (M)",
  gdpc: "GDP/c",
  gdpcGrowth: "GDP/c growth (%)",
  gdpGrowth: "GDP growth (%)",
};

export const CountryGDPChart = ({ stats, type }: CountryChartProps) => {
  const data = useMemo(
    () =>
      stats.map((obj) => ({
        ...obj,
        date: obj.date.slice(0, 4),
        gdpGrowth: obj.gdpGrowth * 100,
        gdpcGrowth: obj.gdpcGrowth == null ? null : obj.gdpcGrowth * 100,
      })),
    [stats],
  );

  const option = useMemo(() => {
    const seriesKey = type as keyof typeof typeMap;
    const growthKey = `${type}Growth` as keyof Vic3GraphData;
    const growthSeriesKey = growthKey as keyof typeof typeMap;
    const xAxisData = data.map((item) => item.date);
    const primarySeries = data.map((item) => item[type] as number | null);
    const growthSeries = data.map((item) => item[growthKey] as number | null);
    const isDark = isDarkMode();

    return {
      legend: {
        data: [typeMap[seriesKey], typeMap[growthSeriesKey]],
        textStyle: {
          color: isDark ? "#fff" : "#000",
        },
      },
      tooltip: {
        trigger: "axis",
        formatter: (params) => {
          const items = Array.isArray(params) ? params : [params];
          return items
            .map((param) => {
              const rawValue = Array.isArray(param.value) ? param.value[1] : param.value;
              const isGrowth =
                param.seriesName === typeMap.gdpcGrowth || param.seriesName === typeMap.gdpGrowth;
              const suffix = isGrowth ? "%" : "";
              const value = rawValue == null ? "—" : `${formatFloat(+rawValue, 2)}${suffix}`;
              return `${param.marker}${escapeEChartsHtml(param.seriesName)}: ${value}`;
            })
            .join("<br />");
        },
      },
      xAxis: {
        type: "category",
        data: xAxisData,
        axisLabel: {
          color: isDark ? "#bbb" : "#666",
        },
        axisLine: {
          lineStyle: {
            color: isDark ? "#666" : "#999",
          },
        },
        splitLine: {
          show: true,
          lineStyle: {
            type: "dashed",
            color: isDark ? "#ddd" : "#333",
            opacity: 0.3,
            width: 1,
          },
        },
      },
      yAxis: [
        {
          type: "value",
          alignTicks: true,
          axisLabel: {
            color: isDark ? "#bbb" : "#666",
          },
          axisLine: {
            lineStyle: {
              color: isDark ? "#666" : "#999",
            },
          },
          splitLine: {
            show: true,
            lineStyle: {
              type: "dashed",
              color: isDark ? "#ddd" : "#333",
              opacity: 0.3,
              width: 1,
            },
          },
        },
        {
          type: "value",
          alignTicks: true,
          axisLabel: {
            color: isDark ? "#bbb" : "#666",
          },
          axisLine: {
            lineStyle: {
              color: isDark ? "#666" : "#999",
            },
          },
          splitLine: {
            show: true,
            lineStyle: {
              type: "dashed",
              color: isDark ? "#ddd" : "#333",
              opacity: 0.3,
              width: 1,
            },
          },
        },
      ],
      series: [
        {
          name: typeMap[seriesKey],
          type: "line",
          data: primarySeries,
        },
        {
          name: typeMap[growthSeriesKey],
          type: "line",
          yAxisIndex: 1,
          lineStyle: {
            width: 0.5,
            type: "dashed",
          },
          data: growthSeries,
        },
      ],
    } satisfies EChartsOption;
  }, [data, type]);

  if (!stats.some((item) => item[type] != null)) {
    const message =
      type === "gdpc"
        ? "GDP per capita data is not available in this save."
        : "GDP data is not available in this save.";
    return (
      <div className="flex h-[400px] items-center justify-center text-sm text-slate-500">
        {message}
      </div>
    );
  }

  return <EChart option={option} />;
};
