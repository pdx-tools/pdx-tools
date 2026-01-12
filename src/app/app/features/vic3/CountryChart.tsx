import { useMemo } from "react";
import type { Vic3GraphData } from "./worker/types";
import { formatFloat } from "@/lib/format";
import { isDarkMode } from "@/lib/dark";
import type { EChartsOption } from "@/components/viz/EChart";
import { EChart } from "@/components/viz/EChart";

export interface CountryChartProps {
  stats: Vic3GraphData[];
  type: keyof Vic3GraphData;
}

const typeMap = {
  gdp: "GDP (M)",
  gdpc: "GDP/c",
  gdpcGrowth: "GDP inc (%)",
  gdpGrowth: "GDP/c inc (%)",
};

export const CountryGDPChart = ({ stats, type }: CountryChartProps) => {
  const data = useMemo(
    () =>
      stats.map((obj) => ({
        ...obj,
        date: obj.date.slice(0, 4),
        gdpGrowth: obj.gdpGrowth * 100,
        gdpcGrowth: obj.gdpcGrowth * 100,
      })),
    [stats],
  );

  const option = useMemo(() => {
    const seriesKey = type as keyof typeof typeMap;
    const growthKey = `${type}Growth` as keyof Vic3GraphData;
    const growthSeriesKey = growthKey as keyof typeof typeMap;
    const xAxisData = data.map((item) => item.date);
    const primarySeries = data.map((item) => item[type] as number);
    const growthSeries = data.map((item) => item[growthKey] as number);
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
              const rawValue = Array.isArray(param.value)
                ? param.value[1]
                : param.value;
              const isGrowth =
                param.seriesName === typeMap.gdpcGrowth ||
                param.seriesName === typeMap.gdpGrowth;
              const suffix = isGrowth ? "%" : "";
              return `${param.marker}${param.seriesName}: ${formatFloat(
                +(rawValue ?? 0),
                2,
              )}${suffix}`;
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

  return <EChart option={option} />;
};
