import { useCallback, useEffect } from "react";
import { useTagFilter } from "../../store";
import { useAnalysisWorker } from "../../worker";
import {
  Scatter,
  ScatterConfig,
  useVisualizationDispatch,
} from "@/components/viz";
import { Alert } from "@/components/Alert";
import { CountryDevEffiency } from "../../../../../../wasm-eu4/pkg/wasm_eu4";
import { formatFloat, formatInt } from "@/lib/format";
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

  const topCountries = new Set(data.slice(0, 15).map((x) => x.country.tag));

  const config = {
    appendPadding: 10,
    data,
    xField: "dev_clicks",
    yField: "dev_mana",
    size: 4,
    tooltip: {
      customContent: (_title, items) => {
        if (items[0] === undefined) {
          return;
        }

        const data = items[0].data as CountryDevEffiency;
        return `
            <div class="px-3 py-2">
                <div class="text-base">${data.country.name}</div>
                <table>
                    <tbody>
                        <tr>
                            <td>Mana spent:</td>
                            <td class="pl-2 text-right">${formatInt(data.dev_mana)}</td>
                        </tr>
                        <tr>
                            <td>Dev clicks:</td>
                            <td class="pl-2 text-right">${formatInt(data.dev_clicks)}</td>
                        </tr>
                        <tr>
                            <td>Average:</td>
                            <td class="pl-2 text-right">${formatFloat(data.dev_mana / data.dev_clicks, 2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
      },
    },

    yAxis: {
      title: {
        text: "Mana spent",
        style: {
          fill: isDarkMode() ? "#fff" : "#000",
        },
      },
      nice: true,
      line: {
        style: {
          stroke: "#aaa",
        },
      },
    },
    xAxis: {
      title: {
        text: "Dev clicks",
        style: {
          fill: isDarkMode() ? "#fff" : "#000",
        },
      },
      grid: {
        line: {
          style: {
            stroke: "#eee",
          },
        },
      },
      line: {
        style: {
          stroke: "#aaa",
        },
      },
    },
    label: {
      formatter(text) {
        const tag = (text as CountryDevEffiency).country.tag;
        return topCountries.has(tag) ? tag : "";
      },
      style: {
        fill: isDarkMode() ? "#fff" : "#000",
      },
    },
  } satisfies ScatterConfig;

  return (
    <div className="flex flex-col gap-8 pb-10">
      <Scatter {...config} />
      <DataTable columns={columns} data={data} pagination={true} />
    </div>
  );
};
