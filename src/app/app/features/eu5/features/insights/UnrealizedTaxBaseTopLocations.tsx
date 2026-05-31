import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Eu5DataTable, Eu5MapDataTable } from "../../components";
import type { UnrealizedTaxBaseTopLocation } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { locationProfileEntry, usePanelNav } from "../profiles/PanelNavContext";
import { usePanToEntity } from "../../usePanToEntity";
import { CountryLink } from "../profiles/EntityLink";
import { MapHoverButton } from "../../MapHoverButton";

const BACK_LABEL = "Tax Base Gap";
const columnHelper = createColumnHelper<UnrealizedTaxBaseTopLocation>();

export function UnrealizedTaxBaseTopLocations({
  locations,
}: {
  locations: UnrealizedTaxBaseTopLocation[];
}) {
  const nav = usePanelNav();
  const panToEntity = usePanToEntity();

  const columns = useMemo(
    () => [
      columnHelper.accessor("location", {
        id: "location",
        sortingFn: (a, b) => a.original.location.name.localeCompare(b.original.location.name),
        meta: Eu5DataTable.meta({ headerLabel: "Location", variant: "pin" }),
        cell: ({ row }) => {
          const loc = row.original;
          return (
            <MapHoverButton
              target={{ kind: "location", locationIdx: loc.location.key }}
              className="text-left text-game-accent-300 hover:text-game-accent-100 hover:underline"
              onClick={() => {
                nav.pushMany(
                  [locationProfileEntry(loc.location.key, loc.location.name)],
                  BACK_LABEL,
                );
                panToEntity(loc.location.key);
              }}
            >
              {loc.location.name}
            </MapHoverButton>
          );
        },
      }),
      columnHelper.accessor("taxBase", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Tax Base", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 2)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("wealth", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Wealth", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 2)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("unrealizedTaxBase", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Gap", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 2)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor((row) => (row.wealth > 0 ? row.taxBase / row.wealth : 0), {
        id: "realization",
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Realization", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{`${formatFloat(info.getValue() * 100, 1)}%`}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("development", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Development", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 1)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("control", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Control", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 2)}</Eu5DataTable.NumericCell>
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
    ],
    [nav, panToEntity],
  );

  return (
    <Eu5MapDataTable
      className="w-full"
      columns={columns}
      data={locations}
      getRowHoverTarget={(row) => ({ kind: "location", locationIdx: row.location.key })}
      initialSorting={[{ id: "unrealizedTaxBase", desc: true }]}
      pagination
    />
  );
}
