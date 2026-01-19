import { useMemo } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import type { CountryStateEfficacy, StateEfficacyData } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";
import { isDarkMode } from "@/lib/dark";
import { escapeEChartsHtml } from "@/components/viz/EChart";

const columnHelper = createColumnHelper<CountryStateEfficacy>();
const columns = [
  columnHelper.accessor("name", {
    sortingFn: "text",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Country" />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-slate-400">
          {row.original.tag}
        </span>
        <span>{row.original.name}</span>
      </div>
    ),
  }),
  columnHelper.accessor("locationCount", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Locations" />
    ),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),
  columnHelper.accessor("totalEfficacy", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Total Efficacy" />
    ),
    meta: { className: "text-right" },
    cell: (info) => formatFloat(info.getValue(), 1),
  }),
  columnHelper.accessor("avgEfficacy", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Avg per Location" />
    ),
    meta: { className: "text-right" },
    cell: (info) => formatFloat(info.getValue(), 2),
  }),
  columnHelper.accessor("totalPopulation", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Population" />
    ),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),
];

interface StateEfficacyProps {
  data: StateEfficacyData;
}

export const StateEfficacy = ({ data }: StateEfficacyProps) => {
  // Filter nations with < 10 locations
  const filteredData = useMemo(
    () => data.countries.filter((c) => c.locationCount >= 10),
    [data],
  );

  return (
    <div className="flex flex-col gap-8 pb-10">
      <StateEfficacyChart data={filteredData} />
      <DataTable
        className="w-full max-w-5xl self-center"
        columns={columns}
        data={filteredData}
        pagination={true}
      />
    </div>
  );
};

function StateEfficacyChart({ data }: { data: CountryStateEfficacy[] }) {
  const topCountries = useMemo(
    () => new Set(data.slice(0, 12).map((x) => x.tag)),
    [data],
  );
  const isDark = isDarkMode();

  const option = useMemo((): EChartsOption => {
    // Calculate population min/max for symbol sizing
    const populations = data.map((d) => d.totalPopulation);
    const minPop = Math.min(...populations);
    const maxPop = Math.max(...populations);

    const scatterData = data.map((d) => {
      // Scale symbol size between 4-28 based on population
      const normalizedPop =
        maxPop > minPop
          ? (d.totalPopulation - minPop) / (maxPop - minPop)
          : 0.5;
      const symbolSize = 4 + normalizedPop * 24;

      return {
        value: [d.totalEfficacy, d.avgEfficacy],
        tag: d.tag,
        name: d.name,
        locationCount: d.locationCount,
        totalEfficacy: d.totalEfficacy,
        avgEfficacy: d.avgEfficacy,
        totalPopulation: d.totalPopulation,
        symbolSize,
      };
    });

    return {
      grid: {
        left: 80,
        right: 40,
        top: 0,
        bottom: 60,
      },
      xAxis: {
        type: "value",
        name: "Total State Efficacy",
        nameLocation: "middle",
        nameGap: 45,
        nameTextStyle: {
          color: isDark ? "#fff" : "#000",
          fontSize: 12,
          fontWeight: 600,
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
            color: isDark ? "#444" : "#ccc",
            opacity: 0.5,
            width: 1,
          },
        },
        min: 0,
      },
      yAxis: {
        type: "value",
        name: "Average Efficacy per Location",
        nameLocation: "middle",
        nameGap: 60,
        nameTextStyle: {
          color: isDark ? "#fff" : "#000",
          fontSize: 12,
          fontWeight: 600,
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
            color: isDark ? "#444" : "#ccc",
            opacity: 0.5,
            width: 1,
          },
        },
        min: 0,
      },
      tooltip: {
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) {
            return "";
          }

          const d = params.data as (typeof scatterData)[number];

          return `
            <strong>${escapeEChartsHtml(d.name)}</strong> (${escapeEChartsHtml(d.tag)})<br/>
            Locations: ${formatInt(d.locationCount)}<br/>
            Total Efficacy: ${formatFloat(d.totalEfficacy, 1)}<br/>
            Avg per Location: ${formatFloat(d.avgEfficacy, 2)}<br/>
            Population: ${formatInt(d.totalPopulation)}
          `;
        },
      },
      series: [
        {
          type: "scatter",
          data: scatterData,
          symbolSize: (data) => {
            const d = data as (typeof scatterData)[number];
            return d.symbolSize;
          },
          itemStyle: {
            color: isDark ? "#93c5fd" : "#3b82f6",
            opacity: 0.75,
          },
          label: {
            show: true,
            formatter: (params) => {
              if (Array.isArray(params)) {
                return "";
              }

              const d = params.data as (typeof scatterData)[number];
              return topCountries.has(d.tag) ? d.tag : "";
            },
            position: "top",
            color: isDark ? "#fff" : "#000",
            fontSize: 10,
            fontWeight: 600,
            distance: 5,
          },
        },
      ],
    };
  }, [data, topCountries, isDark]);

  return <EChart option={option} style={{ height: "500px", width: "100%" }} />;
}
