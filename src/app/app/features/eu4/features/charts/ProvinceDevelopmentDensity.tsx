import { useCallback, useEffect, useMemo } from "react";
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

  const { chartPoints, xMin, xMax } = useMemo(() => {
    if (!data) {
      return { chartPoints: [], xMin: 0, xMax: 0 };
    }

    const boundedPoints = data.points
      .filter((point) => point.x >= data.min && point.x <= data.max)
      .sort((a, b) => a.x - b.x);
    if (boundedPoints.length === 0) {
      return { chartPoints: [], xMin: 0, xMax: 0 };
    }
    return {
      chartPoints: boundedPoints,
      xMin: Math.floor(boundedPoints[0].x),
      xMax: Math.ceil(boundedPoints[boundedPoints.length - 1].x),
    };
  }, [data]);

  useEffect(() => {
    if (chartPoints.length === 0) {
      return;
    }

    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: async () => {
        const rows = chartPoints.map((point) => ({
          development: point.x,
          density: point.y,
        }));

        return createCsv(rows, ["development", "density"]);
      },
    });
  }, [chartPoints, visualizationDispatch]);

  if (error) {
    return <Alert.Error msg={error} />;
  }

  if (!data) {
    return null;
  }

  const axisColor = isDarkMode() ? "#fff" : "#000";
  const config: LineConfig = {
    data: chartPoints,
    xField: "x",
    yField: "y",
    smooth: true,
    appendPadding: [8, 16, 8, 8],
    meta: {
      x: { min: data.min, max: data.max, nice: false, type: "linear" },
    },
    xAxis: {
      title: {
        text: "Development",
        style: { fill: axisColor },
      },
      min: xMin,
      max: xMax,
      minLimit: xMin,
      maxLimit: xMax,
      nice: false,
      label: {
        formatter: (text: string) => {
          const val = Number(text);
          return Number.isFinite(val) ? Math.round(val).toString() : text;
        },
        style: { fill: axisColor },
      },
    },
    yAxis: {
      title: {
        text: "Density",
        style: { fill: axisColor },
      },
      label: {
        formatter: (text: string) => {
          const val = Number(text);
          return Number.isFinite(val) ? formatFloat(val, 4) : text;
        },
        style: { fill: axisColor },
      },
    },
    tooltip: {
      shared: false,
      customItems: (items) =>
        items.map((item) => ({
          ...item,
          name: "Density",
          value: formatFloat(item.data.y as number, 4),
          data: {
            ...item.data,
            xLabel: `Development`,
            xValue: formatFloat(item.data.x as number, 2),
          },
        })),
      customContent: (_title, items = []) => {
        if (!items[0]) return "";
        const datum = items[0].data as { x: number; y: number; xLabel?: string; xValue?: string };
        return `
          <div class="px-3 py-2">
            <div class="text-sm">${datum.xLabel ?? "Development"}: ${datum.xValue ?? formatFloat(datum.x, 2)}</div>
            <div class="text-sm">Density: ${formatFloat(datum.y, 4)}</div>
          </div>
        `;
      },
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
