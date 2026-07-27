import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Eu5DataTable, Eu5MapDataTable } from "../../components";
import type { DevTopLocation } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { LocationLink } from "../profiles/LocationLink";
import { CountryLink } from "../profiles/EntityLink";

const BACK_LABEL = "Development";

const columnHelper = createColumnHelper<DevTopLocation>();

interface Props {
  locations: DevTopLocation[];
}

export function DevelopmentTopLocations({ locations }: Props) {
  const columns = useMemo(
    () => [
      columnHelper.accessor("location", {
        id: "location",
        sortingFn: (a, b) => a.original.location.name.localeCompare(b.original.location.name),
        meta: Eu5DataTable.meta({ headerLabel: "Location", variant: "pin" }),
        cell: ({ row }) => {
          const loc = row.original;
          return <LocationLink location={loc.location} backLabel={BACK_LABEL} />;
        },
      }),
      columnHelper.accessor("development", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Development", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 1)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("owner", {
        id: "owner",
        sortingFn: (a, b) =>
          a.original.owner.country.name.localeCompare(b.original.owner.country.name),
        meta: Eu5DataTable.meta({ headerLabel: "Owner" }),
        cell: ({ row }) => (
          <CountryLink country={row.original.owner} aligned backLabel={BACK_LABEL} />
        ),
      }),
      columnHelper.accessor("population", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Population", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatInt(info.getValue())}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("control", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Control", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 2)}</Eu5DataTable.NumericCell>
        ),
      }),
    ],
    [],
  );

  return (
    <Eu5MapDataTable
      className="w-full"
      columns={columns}
      data={locations}
      getRowHoverTarget={(row) => ({ kind: "location", locationIdx: row.location.key })}
      pagination
    />
  );
}
