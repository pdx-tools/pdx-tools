import { useCallback, useEffect, useMemo } from "react";
import { useTagFilter } from "../../store";
import { useAnalysisWorker } from "../../worker";
import { EChart, useVisualizationDispatch } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
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

  const isDark = isDarkMode();

  const option: EChartsOption = {
    grid: {
      left: 60,
      right: 40,
      top: 40,
      bottom: 60,
    },
    xAxis: {
      type: "value",
      name: "Development",
      nameLocation: "middle",
      nameGap: 30,
      nameTextStyle: {
        color: isDark ? "#ddd" : "#333",
        fontSize: 12,
      },
      min: xMin,
      max: xMax,
      axisLabel: {
        color: isDark ? "#bbb" : "#666",
        formatter: (value: number) => Math.round(value).toString(),
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
    yAxis: {
      type: "value",
      name: "Density",
      nameLocation: "middle",
      nameGap: 50,
      nameTextStyle: {
        color: isDark ? "#ddd" : "#333",
        fontSize: 12,
      },
      axisLabel: {
        color: isDark ? "#bbb" : "#666",
        formatter: (value: number) => formatFloat(value, 4),
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
    tooltip: {
      trigger: "axis",
      formatter: (params) => {
        if (!Array.isArray(params) || params.length === 0) {
          return "";
        }
        const param = params[0];
        const data = param.data as [number, number];
        return `
          <div style="padding: 8px;">
            <div>Development: ${formatFloat(data[0], 2)}</div>
            <div>Density: ${formatFloat(data[1], 4)}</div>
          </div>
        `;
      },
    },
    series: [
      {
        type: "line",
        data: chartPoints.map((point) => [point.x, point.y]),
        smooth: true,
        showSymbol: false,
        lineStyle: {
          color: isDark ? "#93c5fd" : "#5B8FF9",
          width: 2,
        },
        itemStyle: {
          color: isDark ? "#93c5fd" : "#5B8FF9",
        },
      },
    ],
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
      {data.points.length !== 0 ? (
        <EChart option={option} style={{ height: "400px", width: "100%" }} />
      ) : null}
    </div>
  );
};
