import { useCallback, useEffect, useMemo } from "react";
import { useTagFilter } from "../../store";
import { useAnalysisWorker } from "../../worker";
import { EChart, useVisualizationDispatch } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { Alert } from "@/components/Alert";
import type {
  CountryDevEfficiencies,
  CountryDevEffiency,
} from "@/wasm/wasm_eu4";
import { formatFloat, formatInt } from "@/lib/format";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { Flag } from "../../components/avatars";
import { DataTable } from "@/components/DataTable";
import { isDarkMode } from "@/lib/dark";
import { createCsv } from "@/lib/csv";

const columnHelper = createColumnHelper<CountryDevEffiency>();
const columns = [
  columnHelper.accessor("country.name", {
    sortingFn: "text",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Country" />
    ),
    cell: ({ row }) => (
      <Flag tag={row.original.country.tag} name={row.original.country.name} />
    ),
  }),
  columnHelper.accessor("dev_clicks", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Dev Clicks" />
    ),
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),

  columnHelper.group({
    header: "Mana spent",
    columns: [
      ...(["adm", "dip", "mil", "total"] as const).map((category) =>
        columnHelper.accessor(
          category === "total" ? "dev_mana" : `mana.${category}.develop_prov`,
          {
            sortingFn: "basic",
            header: ({ column }) => (
              <Table.ColumnHeader column={column} title={category} />
            ),
            meta: { className: "text-right" },
            cell: (info) => formatInt(info.getValue()),
          },
        ),
      ),
      columnHelper.accessor((x) => x.dev_mana / x.dev_clicks, {
        id: "per click",
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title={"per click"} />
        ),
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 2),
      }),
    ],
  }),
];

export const DevEfficiency = () => {
  const countryFilter = useTagFilter();
  const { data, error } = useAnalysisWorker(
    useCallback(
      (worker) =>
        worker.eu4GetDevEfficiencies({
          ...countryFilter,
          ai: countryFilter.ai === "all" ? "alive" : countryFilter.ai,
        }),
      [countryFilter],
    ),
  );
  const visualizationDispatch = useVisualizationDispatch();

  useEffect(() => {
    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: async () => {
        if (data === undefined || data.length < 1) {
          return "";
        }

        const csv = data.map((row) => ({
          name: row.country.name,
          tag: row.country.tag,
          dev_clicks: row.dev_clicks,
          adm: row.mana.adm.develop_prov,
          dip: row.mana.dip.develop_prov,
          mil: row.mana.mil.develop_prov,
        }));

        return createCsv(csv, [
          "name",
          "tag",
          "dev_clicks",
          "adm",
          "dip",
          "mil",
        ]);
      },
    });
  }, [data, visualizationDispatch]);

  if (error) {
    return <Alert.Error msg={error} />;
  }

  if (data === undefined) {
    return null;
  }

  return (
    <div className="flex flex-col gap-8 pb-10">
      <DevEfficiencyChart data={data} />
      <DataTable columns={columns} data={data} pagination={true} />
    </div>
  );
};

function DevEfficiencyChart({ data }: { data: CountryDevEfficiencies }) {
  const topCountries = useMemo(
    () => new Set(data.slice(0, 15).map((x) => x.country.tag)),
    [data],
  );
  const isDark = isDarkMode();

  const option = useMemo((): EChartsOption => {
    const scatterData = data.map((d) => ({
      value: [d.dev_clicks, d.dev_mana],
      country: d.country,
      dev_clicks: d.dev_clicks,
      dev_mana: d.dev_mana,
    }));

    return {
      grid: {
        left: 60,
        right: 40,
        top: 40,
        bottom: 40,
      },
      xAxis: {
        type: "value",
        name: "Dev clicks",
        nameLocation: "middle",
        nameGap: 30,
        nameTextStyle: {
          color: isDark ? "#fff" : "#000",
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
      },
      yAxis: {
        type: "value",
        name: "Mana spent",
        nameLocation: "middle",
        nameGap: 50,
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
      },
      tooltip: {
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) {
            return "";
          }

          const d = params.data as (typeof scatterData)[number];
          const avg = d.dev_mana / d.dev_clicks;
          return `
            <strong>${escapeEChartsHtml(d.country.name)}</strong><br/>
            Mana spent: ${formatInt(d.dev_mana)}<br/>
            Dev clicks: ${formatInt(d.dev_clicks)}<br/>
            Average: ${formatFloat(avg, 2)}
          `;
        },
      },
      series: [
        {
          type: "scatter",
          data: scatterData,
          symbolSize: 4,
          itemStyle: {
            color: isDark ? "#93c5fd" : "#5B8FF9",
            opacity: 0.85,
          },
          label: {
            show: true,
            formatter: (params) => {
              if (Array.isArray(params)) {
                return "";
              }

              const d = params.data as (typeof scatterData)[number];
              return topCountries.has(d.country.tag) ? d.country.tag : "";
            },
            position: "top",
            color: isDark ? "#fff" : "#000",
            fontSize: 11,
            fontWeight: 500,
            distance: 8,
          },
        },
      ],
    };
  }, [data, topCountries, isDark]);

  return <EChart option={option} style={{ height: "400px", width: "100%" }} />;
}
