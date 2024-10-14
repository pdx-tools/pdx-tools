import React, { useMemo } from "react";
import { formatFloat, formatInt } from "@/lib/format";
import { LegendColor, Pie, PieConfig } from "@/components/viz";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";
import { isDarkMode } from "@/lib/dark";

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
  const chartConfig: PieConfig = {
    data: rows,
    angleField: "value",
    colorField: "key",
    autoFit: true,
    color: (data: Record<string, any>) =>
      palette.get(data["key"] as string) || "#000",
    tooltip: {
      formatter: (datum) => {
        if (Number.isInteger(datum.value)) {
          return { name: datum.key, value: formatInt(datum.value) };
        } else {
          return { name: datum.key, value: formatFloat(datum.value) };
        }
      },
    },
    label: {
      type: "inner",
      offset: "-30%",
      formatter: (_text: any, item: any) => `${item._origin.value.toFixed(0)}`,
    },
    interactions: [{ type: "element-active" }],
    legend: {
      itemName: {
        style: {
          fill: isDarkMode() ? "#fff" : "#000",
        },
      },
    },
  };

  return <Pie {...chartConfig} />;
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
    <div className="flex gap-6">
      <div>
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
