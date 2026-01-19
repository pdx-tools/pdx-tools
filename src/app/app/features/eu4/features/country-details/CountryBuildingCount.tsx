import React, { useMemo } from "react";
import type { CountryDetails } from "../../types/models";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { isDarkMode } from "@/lib/dark";
import { formatInt } from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";

interface CountryBuildingCountProps {
  details: CountryDetails;
}

const CountryBuildingCountImpl = ({ details }: CountryBuildingCountProps) => {
  const data = Array.from(details.building_count.entries(), ([key, val]) => ({
    label: key,
    value: val,
  }));

  data.sort((a, b) => a.label.localeCompare(b.label));

  const isDark = isDarkMode();

  const option = useMemo((): EChartsOption => {
    return {
      grid: {
        left: 100,
        right: 40,
        top: 20,
        bottom: 40,
      },
      xAxis: {
        type: "value",
        name: "Provinces",
        nameLocation: "middle",
        nameGap: 30,
        nameTextStyle: {
          color: isDark ? "#ddd" : "#333",
          fontSize: 12,
        },
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
        min: 0,
        max: details.num_cities,
      },
      yAxis: {
        type: "category",
        name: "Building",
        nameLocation: "end",
        nameTextStyle: {
          color: isDark ? "#ddd" : "#333",
          fontSize: 12,
        },
        axisLabel: {
          color: isDark ? "#bbb" : "#666",
        },
        axisLine: {
          lineStyle: {
            color: isDark ? "#666" : "#999",
          },
        },
        data: data.map((d) => d.label),
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow",
        },
        formatter: (params) => {
          if (!Array.isArray(params)) {
            return "";
          }
          const param = params[0];
          return `
            <strong>${escapeEChartsHtml(param.name)}</strong><br/>
            Provinces: ${formatInt(+(param.value ?? 0))}
          `;
        },
      },
      series: [
        {
          type: "bar",
          data: data.map((d) => d.value),
          itemStyle: {
            color: isDark ? "#93c5fd" : "#5B8FF9",
          },
          label: {
            show: true,
            position: "inside",
            formatter: (params) => formatInt(+(params.value ?? 0)),
            color: "#fff",
          },
        },
      ],
    };
  }, [data, details.num_cities, isDark]);

  return (
    <EChart
      option={option}
      style={{ height: 20 + 30 * data.length, width: "100%" }}
    />
  );
};

export const CountryBuildingCount = React.memo(CountryBuildingCountImpl);
