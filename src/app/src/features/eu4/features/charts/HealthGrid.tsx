import React, { useCallback, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import type { HeatmapConfig } from "@ant-design/charts";
import { formatInt } from "@/lib/format";
import { Heatmap } from "@/components/viz";
import { HealthDatum } from "@/features/eu4/types/models";
import { selectEu4CountryFilter } from "@/features/eu4/eu4Slice";
import { WorkerClient, useAnalysisWorker } from "@/features/engine";

export const HealthGrid: React.FC<{}> = () => {
  const [data, setData] = useState<HealthDatum[]>([]);
  const countryFilter = useSelector(selectEu4CountryFilter);
  const cb = useCallback(
    async (worker: WorkerClient) => {
      const health = await worker.eu4GetHealth(countryFilter);
      setData(health.data);
    },
    [countryFilter]
  );

  const countryCount = useMemo(() => {
    const countSet = new Set();
    for (let i = 0; i < data.length; i++) {
      const element = data[i];
      countSet.add(element.tag);
    }
    return countSet.size;
  }, [data]);

  useAnalysisWorker(cb);

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
      showMarkers: false,
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
        values: [
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
        ],
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
