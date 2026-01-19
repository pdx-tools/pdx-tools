import React, { useEffect, useMemo } from "react";
import { EChart, useVisualizationDispatch } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import type { LedgerDatum } from "@/features/eu4/types/models";
import { createCsv } from "@/lib/csv";
import { useCountryNameLookup } from "@/features/eu4/store";
import type { useLedgerData } from "./hooks";
import { Alert } from "@/components/Alert";
import { isDarkMode } from "@/lib/dark";
import { formatInt } from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";

interface LedgerProps {
  ledger: LedgerDatum[];
}

type MemoProps = LedgerProps & {
  lookup: ReturnType<typeof useCountryNameLookup>;
};

const AnnualLedgerPropped = React.memo(function AnnualLedgerPropped({
  ledger,
  lookup,
}: MemoProps) {
  const isDark = isDarkMode();

  const option = useMemo((): EChartsOption => {
    // Group data by country name
    const groupedData = new Map<string, Array<[number, number]>>();
    const allYears = new Set<number>();

    ledger.forEach((datum) => {
      // Skip entries with null year or value
      if (datum.year === null || datum.value === null) {
        return;
      }

      if (!groupedData.has(datum.name)) {
        groupedData.set(datum.name, []);
      }
      groupedData.get(datum.name)!.push([datum.year, datum.value]);
      allYears.add(datum.year);
    });

    const sortedYears = Array.from(allYears).sort((a, b) => a - b);

    // Create series for each country
    const series = Array.from(groupedData.entries()).map(([name, data]) => ({
      name,
      type: "line" as const,
      data: data.sort((a, b) => a[0] - b[0]),
      itemStyle: {
        color: lookup.get(name)?.color ?? "#000",
      },
      lineStyle: {
        color: lookup.get(name)?.color ?? "#000",
      },
      symbol: "circle",
      symbolSize: 4,
    }));

    return {
      grid: {
        left: 150,
        right: 40,
        top: 40,
        bottom: 80,
      },
      legend: {
        type: "scroll",
        orient: "vertical",
        left: 10,
        top: 20,
        width: 300,
        textStyle: {
          color: isDark ? "#fff" : "#000",
        },
        pageTextStyle: {
          color: isDark ? "#fff" : "#000",
        },
      },
      tooltip: {
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) {
            return "";
          }
          const data = params.data as [number, number];
          return `
            <strong>${escapeEChartsHtml(params.seriesName)}</strong><br/>
            Year: ${data[0]}<br/>
            Value: ${formatInt(data[1])}
          `;
        },
      },
      xAxis: {
        type: "value",
        name: "Year",
        nameLocation: "middle",
        nameGap: 30,
        nameTextStyle: {
          color: isDark ? "#ddd" : "#333",
          fontSize: 12,
        },
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
        min: sortedYears[0],
        max: sortedYears[sortedYears.length - 1],
      },
      yAxis: {
        type: "value",
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
      dataZoom: [
        {
          type: "slider",
          start: 0,
          end: 100,
          xAxisIndex: 0,
          filterMode: "none",
          labelFormatter: (value: number) => Math.round(value).toString(),
          textStyle: {
            color: isDark ? "#fff" : "#000",
          },
          borderColor: isDark ? "#666" : "#999",
          fillerColor: isDark
            ? "rgba(147, 197, 253, 0.2)"
            : "rgba(91, 143, 249, 0.2)",
          handleStyle: {
            color: isDark ? "#93c5fd" : "#5B8FF9",
          },
          moveHandleStyle: {
            color: isDark ? "#93c5fd" : "#5B8FF9",
          },
        },
      ],
      series,
    };
  }, [ledger, lookup, isDark]);

  return <EChart option={option} style={{ height: "100%", width: "100%" }} />;
});

export const AnnualLedger = ({
  ledger: { data = [], error },
}: {
  ledger: ReturnType<typeof useLedgerData>;
}) => {
  const lookup = useCountryNameLookup();
  const visualizationDispatch = useVisualizationDispatch();

  useEffect(() => {
    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: async () => {
        const keys: (keyof LedgerDatum)[] = ["tag", "name", "year", "value"];
        return createCsv(data, keys);
      },
    });
  }, [data, visualizationDispatch]);

  return (
    <>
      <Alert.Error msg={error} />
      <div className="h-[calc(100%-1px)]">
        {data.length != 0 ? (
          <AnnualLedgerPropped ledger={data} lookup={lookup} />
        ) : null}
      </div>
    </>
  );
};
