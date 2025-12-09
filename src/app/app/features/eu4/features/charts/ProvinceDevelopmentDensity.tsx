import { useCallback, useEffect } from "react";
import { useTagFilter } from "../../store";
import { useAnalysisWorker } from "../../worker";
import { Line, useVisualizationDispatch } from "@/components/viz";
import type { LineConfig } from "@/components/viz";
import { Alert } from "@/components/Alert";
import { createCsv } from "@/lib/csv";
import { formatFloat, formatInt } from "@/lib/format";
import { isDarkMode } from "@/lib/dark";

export const ProvinceDevelopmentDensity = () => {
  const countryFilter = useTagFilter();
  const { data, error } = useAnalysisWorker(
    useCallback(
      (worker) => worker.eu4GetProvinceDevDensity(countryFilter),
      [countryFilter],
    ),
  );
  const visualizationDispatch = useVisualizationDispatch();

  useEffect(() => {
    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: async () => {
        if (!data) {
          return "";
        }

        const rows = data.points.map((point) => ({
          development: point.x,
          density: point.y,
        }));

        return createCsv(rows, ["development", "density"]);
      },
    });
  }, [data, visualizationDispatch]);

  if (error) {
    return <Alert.Error msg={error} />;
  }

  if (!data) {
    return null;
  }

  const axisColor = isDarkMode() ? "#fff" : "#000";
  const config: LineConfig = {
    data: data.points,
    xField: "x",
    yField: "y",
    smooth: true,
    xAxis: {
      title: {
        text: "Development",
        style: { fill: axisColor },
      },
      label: {
        style: { fill: axisColor },
      },
    },
    yAxis: {
      title: {
        text: "Density",
        style: { fill: axisColor },
      },
      label: {
        style: { fill: axisColor },
      },
    },
    tooltip: {
      formatter: (datum) => ({
        name: "Density",
        value: datum.y,
      }),
    },
  };

  return (
    <div className="flex flex-col gap-4 pb-10">
      {data.totalProvinces === 0 ? (
        <Alert variant="info">
          <Alert.Description>
            No provinces matched the current filter.
          </Alert.Description>
        </Alert>
      ) : null}
      <div className="text-sm text-slate-600 dark:text-slate-300">
        Bandwidth: {formatFloat(data.bandwidth, 2)} | Range:{" "}
        {formatFloat(data.min, 2)} – {formatFloat(data.max, 2)} | Provinces
        counted: {formatInt(data.totalProvinces)}
      </div>
      {data.points.length !== 0 ? <Line {...config} /> : null}
    </div>
  );
};
