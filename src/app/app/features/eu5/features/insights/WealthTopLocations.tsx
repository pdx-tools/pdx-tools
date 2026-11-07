import { useMemo } from "react";
import { createColumnHelper } from "@/lib/tanstack-table";
import { Eu5DataTable, Eu5MapDataTable } from "../../components";
import type { WealthTopLocation } from "@/wasm/wasm_eu5";
import {
  formatExactCount,
  formatExactPercent,
  formatFixed,
  formatPercent,
} from "../../numberFormatting";
import { LocationLink } from "../profiles/LocationLink";
import { CountryLink } from "../profiles/EntityLink";

const BACK_LABEL = "Wealth";

const columnHelper = createColumnHelper<WealthTopLocation>();

interface Props {
  locations: WealthTopLocation[];
}

export function WealthTopLocations({ locations }: Props) {
  const columns = useMemo(
    () => [
      columnHelper.accessor("location", {
        id: "location",
        sortFn: (a, b) => a.original.location.name.localeCompare(b.original.location.name),
        meta: Eu5DataTable.meta({ headerLabel: "Location", variant: "pin" }),
        cell: ({ row }) => {
          const loc = row.original;
          return <LocationLink location={loc.location} backLabel={BACK_LABEL} />;
        },
      }),
      columnHelper.accessor("wealth", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({
          headerLabel: "Wealth",
          variant: "num",
          exact: formatExactCount,
        }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFixed(info.getValue(), 0)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("development", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Dev", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFixed(info.getValue(), 1)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("control", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({
          headerLabel: "Control",
          variant: "num",
          exact: formatExactPercent,
        }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatPercent(info.getValue())}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("owner", {
        id: "owner",
        sortFn: (a, b) =>
          a.original.owner.country.name.localeCompare(b.original.owner.country.name),
        meta: Eu5DataTable.meta({ headerLabel: "Owner" }),
        cell: ({ row }) => (
          <CountryLink country={row.original.owner} aligned backLabel={BACK_LABEL} />
        ),
      }),
      columnHelper.accessor("population", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Pop", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFixed(info.getValue(), 0)}</Eu5DataTable.NumericCell>
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
