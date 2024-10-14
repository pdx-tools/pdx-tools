import { formatFloat, formatInt } from "@/lib/format";
import React, { useCallback } from "react";
import { CountryDetails, CountryStateDetails } from "../../types/models";
import { useEu4Worker } from "@/features/eu4/worker";
import { Tooltip } from "@/components/Tooltip";
import { Alert } from "@/components/Alert";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";
import { MinusIcon, StarIcon } from "@heroicons/react/24/outline";
import { PlayIcon } from "@heroicons/react/20/solid";

export interface CountryStatesProps {
  details: CountryDetails;
}

const columnHelper = createColumnHelper<CountryStateDetails>();
const columns = [
  columnHelper.accessor("state.name", {
    sortingFn: "text",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="State" />
    ),
    cell: ({ row }) => (
      <div className="flex min-w-[150px] items-center gap-2">
        <Tooltip>
          <Tooltip.Trigger className="text-left">
            {row.original.state.name}
          </Tooltip.Trigger>
          <Tooltip.Content>{row.original.state.id}</Tooltip.Content>
        </Tooltip>
        {row.original.capital_state && (
          <Tooltip>
            <Tooltip.Trigger className="flex items-center">
              <StarIcon className="h-4 w-4 text-gray-300" />
            </Tooltip.Trigger>
            <Tooltip.Content>is capital state</Tooltip.Content>
          </Tooltip>
        )}
      </div>
    ),
  }),

  columnHelper.accessor("total_dev", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Dev" />,
    cell: (info) => (
      <div className="text-right">{formatInt(info.getValue())}</div>
    ),
  }),

  columnHelper.accessor("total_gc", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Gov. Cost" />
    ),
    cell: ({ row }) => (
      <Tooltip>
        <Tooltip.Trigger className="w-full text-right">
          {formatFloat(row.original.total_gc, 2)}
        </Tooltip.Trigger>
        <Tooltip.Content>
          {row.original.provinces.map((prov) => (
            <div key={prov.name}>
              {prov.name}: {formatFloat(prov.gc, 2)}
            </div>
          ))}
        </Tooltip.Content>
      </Tooltip>
    ),
  }),

  columnHelper.accessor((x) => x.total_gc - x.total_gc_if_centralized, {
    id: "total_gc_if_centralized",
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Next Centralize Savings" />
    ),
    cell: (info) => (
      <div className="text-right">{formatFloat(info.getValue(), 2)}</div>
    ),
  }),

  columnHelper.accessor("centralizing", {
    sortingFn: (a, b, column) => {
      const aValue = a.getValue<CountryStateDetails["centralizing"]>(column);
      const bValue = b.getValue<CountryStateDetails["centralizing"]>(column);
      return (aValue?.progress ?? -1) - (bValue?.progress ?? -1);
    },
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Centralizing" />
    ),
    meta: { className: "text-right" },
    cell: (info) => {
      const x = info.getValue();
      return x == undefined ? (
        "---"
      ) : (
        <Tooltip>
          <Tooltip.Trigger>{formatFloat(x.progress * 100, 2)}%</Tooltip.Trigger>
          <Tooltip.Content>{x.date}</Tooltip.Content>
        </Tooltip>
      );
    },
  }),

  columnHelper.accessor("centralized", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Centralized" />
    ),
    cell: (info) => (
      <div className="text-right">{formatInt(info.getValue())}</div>
    ),
  }),

  columnHelper.accessor("state_house", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="State House" />
    ),
    meta: { className: "text-right" },
    cell: (info) => (info.getValue() ? "✔️" : ""),
  }),

  columnHelper.accessor("prosperity", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Prosperity" />
    ),
    meta: { className: "text-right" },
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="grow">{formatInt(row.original.prosperity)}</span>
        {row.original.prosperity_mode === true && (
          <PlayIcon className="h-3 w-3 -rotate-90 text-gray-800/80" />
        )}
        {row.original.prosperity_mode === false && (
          <PlayIcon className="h-3 w-3 rotate-90 text-gray-800/80" />
        )}
        {row.original.prosperity_mode === undefined && (
          <MinusIcon className="h-3 w-3" />
        )}
      </div>
    ),
  }),
];

const CountryStatesDataTable = ({ data }: { data: CountryStateDetails[] }) => {
  return (
    <DataTable
      columns={columns}
      data={data}
      initialSorting={[{ id: "total_gc", desc: true }]}
      pagination={true}
    />
  );
};

const CountryStateDataTableImpl = React.memo(CountryStatesDataTable);

export const CountryStates = ({ details }: CountryStatesProps) => {
  const { data = [], error } = useEu4Worker(
    useCallback(
      (worker) => worker.eu4GetCountryStates(details.tag),
      [details.tag],
    ),
  );
  return (
    <>
      <Alert.Error msg={error} />
      <CountryStateDataTableImpl data={data} />
    </>
  );
};
