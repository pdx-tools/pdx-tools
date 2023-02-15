import React, { useCallback, useEffect, useMemo } from "react";
import type { HeatmapConfig } from "@ant-design/charts";
import { formatInt } from "@/lib/format";
import { Heatmap, useVisualizationDispatch } from "@/components/viz";
import { useAnalysisWorker } from "@/features/eu4/worker";
import { createCsv } from "@/lib/csv";
import { useTagFilter } from "../../Eu4SaveProvider";

const healthCategories = [
  "prestige",
  "stability",
  "pp",
  "development",
  "treasury",
  "inflation",
  "corruption",
  "manpower",
  "adm tech",
  "dip tech",
  "mil tech",
  "innovativeness",
  "overextension",
];

export const HealthGrid = () => {
  const countryFilter = useTagFilter();
  const visualizationDispatch = useVisualizationDispatch();

  const { data = [] } = useAnalysisWorker(
    useCallback(
      (worker) => worker.eu4GetHealth(countryFilter).then((x) => x.data),
      [countryFilter]
    )
  );

  useEffect(() => {
    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: async () => {
        const objs: Record<string, any> = {};
        for (const group of data) {
          objs[group.name] = {
            ...objs[group.name],
            [group.value_type]: group.value,
          };
        }

        const flatten = Object.entries(objs).map(([key, values]) => ({
          name: key,
          ...values,
        }));
        return createCsv(flatten, ["name", ...healthCategories]);
      },
    });
  }, [data, visualizationDispatch]);

  const countryCount = useMemo(() => {
    const countSet = new Set();
    for (let i = 0; i < data.length; i++) {
      const element = data[i];
      countSet.add(element.tag);
    }
    return countSet.size;
  }, [data]);

  const config: HeatmapConfig = {
    data,
    autoFit: true,
    xField: "value_type",
    yField: "name",
    colorField: "color",
    color: ["#0d5fbb", "#a2a2a5", "#aa3523"].reverse(),
    interactions: [{ type: "element-active" }],
    legend: false,
    label: false,
    tooltip: {
      customContent: (title, data) => {
        const v = data[0];
        if (!v) {
          return "<div></div>";
        }

        return `<div style="margin: 12px">${v.data.name} - ${
          v.data.value_type
        }: ${formatInt(v.data.value)}</div>`;
      },
    },
    meta: {
      value_type: {
        type: "cat",
        values: healthCategories,
      },
      name: {},
      color: {
        min: -100,
        max: 100,
      },
      value: {},
    },
  };

  return <Heatmap style={{ height: 75 + countryCount * 45 }} {...config} />;
};
