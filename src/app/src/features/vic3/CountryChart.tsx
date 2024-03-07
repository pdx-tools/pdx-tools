import {
  Line,
  LineConfig,
  useVisualizationDispatch,
  VisualizationProvider,
} from "@/components/viz";
import dynamic from "next/dynamic";
import { Vic3GraphData } from "./worker/types";
import React, { useEffect } from "react";
import { createCsv } from "@/lib/csv";
import { VisualizationLoader } from "@/components/viz/VisualizationLoader";
import { formatFloat } from "@/lib/format";

export interface CountryChartProps {
  stats: Vic3GraphData[];
  type: (keyof Vic3GraphData)[];
}

const DualAxes: ComponentType<TreemapConfig> = React.memo(
  dynamic(() => import("@ant-design/plots").then((mod) => mod.DualAxes), {
    ssr: false,
    loading: () => <VisualizationLoader />,
  }),
);

const type_map = {
  gdp: "GDP (M)",
  gdpc: "GDP/c",
  gdpcGrowth: "GDP inc (%)",
  gdpGrowth: "GDP/c inc (%)",
};

export const CountryGDPChart = ({ stats, type }: CountryStatsProps) => {
  //const columnHelper = createColumnHelper<Vic3GraphData>();
  const visualizationDispatch = useVisualizationDispatch();
  const fix_date = stats.map((obj) => {
    return {
      ...obj,
      date: obj.date.slice(0, 4),
      gdpGrowth: obj.gdpGrowth * 100,
      gdpcGrowth: obj.gdpcGrowth * 100,
    };
  });
  const props = {
    data: [fix_date, fix_date],
    xField: "date",
    yField: [type, type + "Growth"],
    legend: {
      itemName: {
        formatter: (text, item) => {
          return type_map[item.value];
        },
      },
    },
    tooltip: {
      // Fromat of d = {date: ..., gdpGrowth: ....}
      formatter: (d) => {
        var line_name = "Unknown";
        for (var k in d) {
          line_name = type_map[k];
          var suffix = "";

          if (line_name !== undefined) {
            if (k.endsWith("Growth")) {
              suffix = "%";
            }

            return { name: line_name, value: formatFloat(d[k], 2) + suffix };
          }
        }

        return { line_name: line_name, value: d.gdp };
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
  };
  return <DualAxes {...props} />;
};
