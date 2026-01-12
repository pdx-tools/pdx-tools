import React, { useMemo } from "react";
import { formatFloat, formatInt } from "@/lib/format";
import { LegendColor } from "./LegendColor";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";
import { EChart } from "./EChart";
import type { EChartsOption } from "./EChart";

export interface DataPoint {
  key: string;
  value: number;
}

interface PieTableProps {
  rows: DataPoint[];
  title: string;
  palette: Readonly<Map<string, string>>;
  paginate?: boolean;
  wholeNumbers?: boolean;
  negativesSlot?: (rows: DataPoint[]) => React.ReactNode;
}

interface PieTablePieProps {
  rows: DataPoint[];
  palette: Readonly<Map<string, string>>;
}

const PieTablePieImpl = ({ rows, palette }: PieTablePieProps) => {
  const option = useMemo((): EChartsOption => {
    return {
      legend: {
        show: false,
      },
      tooltip: {
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) {
            return "";
          }
          const dataPoint = rows.find((r) => r.key === params.name);
          if (!dataPoint) return "";
          const formattedValue = Number.isInteger(dataPoint.value)
            ? formatInt(dataPoint.value)
            : formatFloat(dataPoint.value);
          return `
            <strong>${dataPoint.key}</strong><br/>
            ${formattedValue}
          `;
        },
      },
      series: [
        {
          type: "pie",
          radius: "70%",
          avoidLabelOverlap: true,
          itemStyle: {
            borderColor: "#fff",
            borderWidth: 1,
          },
          label: {
            show: true,
            position: "inside",
            formatter: (params) => {
              const dataPoint = rows.find((r) => r.key === params.name);
              return dataPoint
                ? `${dataPoint.value.toFixed(0)}`
                : (params.value as number).toFixed(0);
            },
            fontSize: 12,
            color: "#fff",
            fontWeight: "bold",
            overflow: "truncate",
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 14,
              fontWeight: "bold",
            },
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: "rgba(0, 0, 0, 0.5)",
            },
          },
          data: rows.map((row) => ({
            name: row.key,
            value: row.value,
            itemStyle: {
              color: palette.get(row.key) || "#000",
            },
          })),
        },
      ],
    };
  }, [rows, palette]);

  return <EChart className="h-96 min-w-0 basis-1/2" option={option} />;
};

const PieTablePie = React.memo(PieTablePieImpl);

const columnHelper = createColumnHelper<DataPoint & { percent: number }>();

export const PieTable = ({
  rows: raw,
  title,
  palette,
  paginate,
  wholeNumbers = false,
  negativesSlot,
}: PieTableProps) => {
  const numFormatter = wholeNumbers ? formatInt : formatFloat;

  const negatives = raw.filter((x) => x.value < 0);
  const rows = raw.filter((x) => x.value >= 0);

  const total = rows.reduce((acc, x) => acc + x.value, 0);

  const data = useMemo(
    () =>
      rows
        .map((x) => ({
          ...x,
          percent: x.value / total,
        }))
        .sort((a, b) => b.value - a.value),
    [total, rows],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor("key", {
        sortingFn: "text",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Class" />
        ),
        cell: (info) => (
          <div className="flex items-center space-x-2">
            <LegendColor color={palette.get(info.getValue())} />
            <span>{info.getValue()}</span>
          </div>
        ),
      }),

      columnHelper.accessor("value", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Value" />
        ),
        cell: (info) => (
          <div className="text-right">{numFormatter(info.getValue())}</div>
        ),
      }),
      columnHelper.accessor("percent", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Percent" />
        ),
        cell: (info) => (
          <div className="text-right">
            {formatFloat(info.getValue() * 100, 2)}%
          </div>
        ),
      }),
    ],
    [palette, numFormatter],
  );

  return (
    <div className="flex w-full gap-6">
      <div className="max-w-sm min-w-sm basis-sm">
        <h3>{title}</h3>
        <DataTable
          columns={columns}
          data={data}
          pagination={paginate}
          summary={
            <Table.Row>
              <Table.Cell>Total</Table.Cell>
              <Table.Cell className="text-right">
                {numFormatter(total)}
              </Table.Cell>
            </Table.Row>
          }
        />
        {negatives.length > 0 && negativesSlot?.(negatives)}
      </div>
      <PieTablePie rows={rows} palette={palette} />
    </div>
  );
};
