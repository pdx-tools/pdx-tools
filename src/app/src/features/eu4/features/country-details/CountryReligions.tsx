import React, { useCallback, useMemo } from "react";
import { formatFloat, formatInt } from "@/lib/format";
import { CountryDetails, CountryReligion } from "../../types/models";
import { Pie, LegendColor, PieConfig } from "@/components/viz";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useEu4Worker } from "@/features/eu4/worker";
import { Tooltip } from "@/components/Tooltip";
import { Alert } from "@/components/Alert";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";

export interface CountryReligionsProps {
  details: CountryDetails;
}

export interface CountryReligionVizProps {
  data: CountryReligion[];
  largeLayout: boolean;
}

const columnHelper = createColumnHelper<CountryReligion>();

const columns = [
  columnHelper.accessor("name", {
    sortingFn: "text",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Religion" />
    ),
    cell: ({ row }) => (
      <Tooltip>
        <Tooltip.Trigger className="flex items-center gap-2">
          <LegendColor color={row.original.color}></LegendColor>
          {row.original.name}
        </Tooltip.Trigger>
        <Tooltip.Content>{row.original.id}</Tooltip.Content>
      </Tooltip>
    ),
  }),

  columnHelper.group({
    header: "Provinces",
    columns: [
      columnHelper.accessor("provinces", {
        sortingFn: "basic",
        header: "Value",
        cell: (info) => (
          <div className="text-right">{formatInt(info.getValue())}</div>
        ),
      }),
      columnHelper.accessor("provinces_percent", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="%" />
        ),
        cell: (info) => (
          <div className="text-right">{formatFloat(info.getValue(), 2)}%</div>
        ),
      }),
    ],
  }),

  columnHelper.group({
    header: "Development",
    columns: [
      columnHelper.accessor("development", {
        sortingFn: "basic",
        header: "Value",
        cell: (info) => (
          <div className="text-right">{formatInt(info.getValue())}</div>
        ),
      }),
      columnHelper.accessor("development_percent", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="%" />
        ),
        cell: (info) => (
          <div className="text-right">{formatFloat(info.getValue(), 2)}%</div>
        ),
      }),
    ],
  }),
];

const CountryReligionVizImpl = ({
  data,
  largeLayout,
}: CountryReligionVizProps) => {
  const palette = useMemo(
    () => new Map(data.map((x) => [x.name, x.color])),
    [data],
  );

  const chartConfig: PieConfig = {
    data,
    angleField: "development",
    colorField: "name",
    autoFit: true,
    innerRadius: 0.5,
    color: (data) => palette.get(data.name) || "#000",
    label: {
      type: "inner",
      offset: "-30%",
      formatter: (_text: any, item: any) =>
        `${item._origin.development.toFixed(0)}`,
    },
    interactions: [{ type: "element-active" }],
    statistic: {
      title: false,
      content: {
        style: {
          whiteSpace: "pre-wrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontSize: "24px",
        },
        formatter: () => "Religion\nDev",
      },
    },
  };

  return (
    <div
      className="flex items-center gap-2"
      style={{ flexDirection: largeLayout ? "row" : "column" }}
    >
      <DataTable
        data={data}
        columns={columns}
        initialSorting={[{ id: "development_percent", desc: true }]}
      />
      <Pie {...chartConfig} />
    </div>
  );
};

const CountryReligionViz = React.memo(CountryReligionVizImpl);

export const CountryReligions = ({ details }: CountryReligionsProps) => {
  const isMd = useBreakpoint("md");
  const { data = [], error } = useEu4Worker(
    useCallback(
      (worker) => worker.eu4GetCountryProvinceReligion(details.tag),
      [details.tag],
    ),
  );

  return (
    <>
      <Alert.Error msg={error} />
      <CountryReligionViz data={data} largeLayout={isMd} />
    </>
  );
};
