import { useEu4Worker } from "@/features/eu4/worker";
import { useCallback, useState } from "react";
import { CountryDetails, CountryLeader } from "../../types/models";
import { Badge } from "@/components/Badge";
import { Alert } from "@/components/Alert";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "@/components/DataTable";
import { Table } from "@/components/Table";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { formatInt } from "@/lib/format";
import { ChevronDownIcon } from "@heroicons/react/20/solid";

export interface CountryLeadersProps {
  details: CountryDetails;
}

const TagsSelect = ({
  onChange,
}: {
  onChange: (s: string | undefined) => void;
}) => {
  const [value, setValue] = useState<string | undefined>();

  const valueUpdate = (x: string | undefined) => {
    setValue(x);
    onChange(x);
  };

  // Update the select key to do a re-render:
  // https://github.com/radix-ui/primitives/issues/1569
  return (
    <Select
      key={value ?? "def"}
      value={value}
      onValueChange={(e) => valueUpdate(e)}
    >
      <Select.Trigger className="data-[placeholder]:font-semibold" asChild>
        <Button>
          <Select.Value placeholder="Tags" />
          <Select.Icon asChild>
            <ChevronDownIcon className="h-4 w-4 self-end opacity-50" />
          </Select.Icon>
        </Button>
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="active">Active</Select.Item>
        <Select.Item value="Admiral">Admiral</Select.Item>
        <Select.Item value="Explorer">Explorer</Select.Item>
        <Select.Item value="General">General</Select.Item>
        <Select.Item value="Conquistador">Conquistador</Select.Item>
        <Select.Item value="ruler">Ruler</Select.Item>

        <Button
          className="ml-1 mt-2 w-full justify-center"
          onClick={() => valueUpdate(undefined)}
        >
          Clear
        </Button>
      </Select.Content>
    </Select>
  );
};

const columnHelper = createColumnHelper<
  CountryLeader & {
    tags: ("active" | CountryLeader["kind"] | "ruler")[];
    total: number;
  }
>();
const columns = [
  columnHelper.accessor("name", {
    sortingFn: "text",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Leader" />
    ),
    meta: { className: "min-w-[180px]" },
    cell: ({ row }) =>
      `${row.original.name}${
        row.original.monarch_stats
          ? ` (${row.original.monarch_stats.adm} / ${row.original.monarch_stats.dip} / ${row.original.monarch_stats.mil})`
          : ""
      }`,
  }),

  columnHelper.accessor("tags", {
    filterFn: "arrIncludes",
    header: ({ column }) => (
      <TagsSelect onChange={(e) => column.setFilterValue(e)} />
    ),
    cell: ({ row }) => (
      <>
        {row.original.active && <Badge variant="green">ACTIVE</Badge>}
        {(row.original.kind == "Admiral" ||
          row.original.kind == "Explorer") && (
          <Badge variant="blue">{row.original.kind.toUpperCase()}</Badge>
        )}
        {(row.original.kind == "General" ||
          row.original.kind == "Conquistador") && (
          <Badge variant="default">{row.original.kind.toUpperCase()}</Badge>
        )}
        {!!row.original.monarch_stats && <Badge variant="gold">RULER</Badge>}
      </>
    ),
  }),

  columnHelper.accessor("activation", {
    sortingFn: "text",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Activation" />
    ),
  }),

  columnHelper.accessor("fire", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Fire" />,
    cell: (info) => (
      <div className="text-right">{formatInt(info.getValue())}</div>
    ),
  }),

  columnHelper.accessor("shock", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Shock" />
    ),
    cell: (info) => (
      <div className="text-right">{formatInt(info.getValue())}</div>
    ),
  }),

  columnHelper.accessor("maneuver", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Maneuver" />
    ),
    cell: (info) => (
      <div className="text-right">{formatInt(info.getValue())}</div>
    ),
  }),

  columnHelper.accessor("siege", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Siege" />
    ),
    cell: (info) => (
      <div className="text-right">{formatInt(info.getValue())}</div>
    ),
  }),

  columnHelper.accessor("total", {
    sortingFn: "basic",
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Total" />
    ),
    cell: (info) => (
      <div className="text-right">{formatInt(info.getValue())}</div>
    ),
  }),
];

export const CountryLeaders = ({ details }: CountryLeadersProps) => {
  const { data = [], error } = useEu4Worker(
    useCallback(
      async (worker) => {
        const leaders = await worker.eu4GetCountryLeaders(details.tag);
        return leaders.map((x) => ({
          ...x,
          tags: [
            ...(x.active ? (["active"] as const) : []),
            x.kind,
            ...(!!x.monarch_stats ? (["ruler"] as const) : []),
          ],
          total: x.fire + x.shock + x.maneuver + x.siege,
        }));
      },
      [details.tag],
    ),
  );

  return (
    <>
      <Alert.Error msg={error} />
      <DataTable columns={columns} data={data} pagination={true} />
    </>
  );
};
