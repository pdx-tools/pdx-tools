import React, { ComponentType, useMemo } from "react";
import dynamic from "next/dynamic";
import { Vic3GraphData } from "./worker/types";
import { VisualizationLoader } from "@/components/viz/VisualizationLoader";
import { formatFloat } from "@/lib/format";
import { DualAxesConfig } from "@ant-design/plots";
import { isDarkMode } from "@/lib/dark";

export interface CountryChartProps {
  stats: Vic3GraphData[];
  type: keyof Vic3GraphData;
}

const DualAxes: ComponentType<DualAxesConfig> = React.memo(
  dynamic(() => import("@ant-design/plots").then((mod) => mod.DualAxes), {
    ssr: false,
    loading: () => <VisualizationLoader />,
  }),
);

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

  const props = {
    data: [data, data],
    xField: "date",
    yField: [type, type + "Growth"],
    legend: {
      itemName: {
        style: {
          fill: isDarkMode() ? "#fff" : "#000",
        },
        formatter: (_text, item) => {
          return typeMap[item.value as keyof typeof typeMap];
        },
      },
    },
    tooltip: {
      formatter: (datum) => {
        const d = datum as Partial<(typeof data)[number]>;
        if (d.gdpc !== undefined) {
          return { name: typeMap.gdpc, value: formatFloat(d.gdpc, 2) };
        } else if (d.gdpcGrowth !== undefined) {
          return {
            name: typeMap.gdpcGrowth,
            value: formatFloat(d.gdpcGrowth, 2) + "%",
          };
        } else if (d.gdp !== undefined) {
          return { name: typeMap.gdp, value: formatFloat(d.gdp, 2) };
        } else if (d.gdpGrowth !== undefined) {
          return {
            name: typeMap.gdpGrowth,
            value: formatFloat(d.gdpGrowth, 2) + "%",
          };
        } else {
          return { name: "Unknown", value: 0 };
        }
      },
    },
    geometryOptions: [
      {
        geometry: "line",
      },
      {
        geometry: "line",
        lineStyle: {
          lineWidth: 0.5,
          lineDash: [5, 5],
        },
      },
    ],
  } satisfies DualAxesConfig;
  return <DualAxes {...props} />;
};
