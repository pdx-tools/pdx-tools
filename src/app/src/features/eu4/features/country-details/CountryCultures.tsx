import React, { useCallback } from "react";
import { formatFloat, formatInt } from "@/lib/format";
import { CountryDetails, CountryCulture } from "../../types/models";
import { useEu4Worker } from "@/features/eu4/worker";
import { Tooltip } from "@/components/Tooltip";
import { Alert } from "@/components/Alert";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";
import { StarIcon } from "@heroicons/react/24/outline";

export interface CountryCulturesProps {
  details: CountryDetails;
}

export interface CountryCultureVizProps {
  data: CountryCulture[];
}

const CultureStar = ({
  tolerance,
}: {
  tolerance: CountryCulture["tolerance"];
}) => {
  switch (tolerance) {
    case "Primary":
      return <StarIcon className="h-4 w-4 text-amber-300" />;
    case "Accepted":
      return <StarIcon className="h-4 w-4 text-gray-300" />;
    case "None":
      return null;
  }
};

const columnHelper = createColumnHelper<CountryCulture>();
const columns = [
  columnHelper.accessor("name", {
    sortingFn: "text",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Culture" />
    ),
    size: 200,
    cell: ({ row }) => (
      <Tooltip>
        <Tooltip.Trigger className="flex min-w-[150px] items-center gap-2">
          <span>{row.original.name}</span>{" "}
          <CultureStar tolerance={row.original.tolerance} />
        </Tooltip.Trigger>
        <Tooltip.Content>
          {row.original.id}
          {row.original.tolerance !== "None"
            ? ` (${row.original.tolerance})`
            : ""}
        </Tooltip.Content>
      </Tooltip>
    ),
  }),

  columnHelper.accessor("group", {
    sortingFn: "text",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Group" />
    ),
  }),

  columnHelper.group({
    header: "Provinces",
    columns: [
      columnHelper.group({
        header: "Count",
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
              <div className="text-right">
                {formatFloat(info.getValue(), 2)}%
              </div>
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
              <div className="text-right">
                {formatFloat(info.getValue(), 2)}%
              </div>
            ),
          }),
        ],
      }),
    ],
  }),

  columnHelper.group({
    header: "Stated Provinces",
    columns: [
      columnHelper.group({
        header: "Count",
        columns: [
          columnHelper.accessor("stated_provs", {
            sortingFn: "basic",
            header: "Value",
            cell: (info) => (
              <div className="text-right">{formatInt(info.getValue())}</div>
            ),
          }),
          columnHelper.accessor("stated_provs_percent", {
            sortingFn: "basic",
            header: ({ column }) => (
              <Table.ColumnHeader column={column} title="%" />
            ),
            cell: (info) => (
              <div className="text-right">
                {formatFloat(info.getValue(), 2)}%
              </div>
            ),
          }),
        ],
      }),

      columnHelper.group({
        header: "Development",
        columns: [
          columnHelper.accessor("stated_provs_development", {
            sortingFn: "basic",
            header: "Value",
            cell: (info) => (
              <div className="text-right">{formatInt(info.getValue())}</div>
            ),
          }),
          columnHelper.accessor("stated_provs_development_percent", {
            sortingFn: "basic",
            header: ({ column }) => (
              <Table.ColumnHeader column={column} title="%" />
            ),
            cell: (info) => (
              <div className="text-right">
                {formatFloat(info.getValue(), 2)}%
              </div>
            ),
          }),
        ],
      }),
    ],
  }),

  columnHelper.group({
    header: "Ongoing Conversions",
    columns: [
      columnHelper.accessor("conversions", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Count" />
        ),
        cell: (info) => (
          <div className="text-right">{formatInt(info.getValue())}</div>
        ),
      }),
      columnHelper.accessor("conversions_development", {
        sortingFn: "basic",
        header: ({ column }) => (
          <Table.ColumnHeader column={column} title="Dev" />
        ),
        cell: (info) => (
          <div className="text-right">{formatInt(info.getValue())}</div>
        ),
      }),
    ],
  }),
];

const CountryCultureVizImpl = ({ data }: CountryCultureVizProps) => {
  return (
    <DataTable
      data={data}
      columns={columns}
      pagination={true}
      initialSorting={[{ id: "stated_provs_development_percent", desc: true }]}
    />
  );
};

const CountryCultureViz = React.memo(CountryCultureVizImpl);

export const CountryCultures = ({ details }: CountryCulturesProps) => {
  const { data = [], error } = useEu4Worker(
    useCallback(
      (worker) => worker.eu4GetCountryProvinceCulture(details.tag),
      [details.tag],
    ),
  );
  return (
    <>
      <Alert.Error msg={error} />
      <CountryCultureViz data={data} />
    </>
  );
};
