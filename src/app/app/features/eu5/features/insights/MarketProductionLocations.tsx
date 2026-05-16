import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Eu5DataTable } from "../../components";
import type { MarketProductionLocationSummary } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { locationProfileEntry, usePanelNav } from "../profiles/PanelNavContext";
import { usePanToEntity } from "../../usePanToEntity";
import { EntityLink } from "../profiles/EntityLink";

const BACK_LABEL = "Markets";
const columnHelper = createColumnHelper<MarketProductionLocationSummary>();

export function MarketProductionLocations({
  locations,
}: {
  locations: MarketProductionLocationSummary[];
}) {
  const nav = usePanelNav();
  const panToEntity = usePanToEntity();

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        sortingFn: "text",
        meta: Eu5DataTable.meta({ headerLabel: "Location", variant: "pin" }),
        cell: ({ row }) => {
          const loc = row.original;
          return (
            <button
              type="button"
              className="text-left text-game-accent-300 hover:text-game-accent-100 hover:underline"
              onClick={() => {
                nav.pushMany([locationProfileEntry(loc.locationIdx, loc.name)], BACK_LABEL);
                panToEntity(loc.locationIdx);
              }}
            >
              {loc.name}
            </button>
          );
        },
      }),
      columnHelper.accessor("rawMaterial", {
        sortingFn: (a, b) =>
          (a.original.rawMaterial ?? "").localeCompare(b.original.rawMaterial ?? ""),
        meta: Eu5DataTable.meta({ headerLabel: "Good" }),
        cell: (info) => info.getValue() ?? "—",
      }),
      columnHelper.accessor("rgoLevel", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "RGO", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 0)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("marketAccess", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Access", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{`${formatFloat(info.getValue() * 100, 0)}%`}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("owner", {
        id: "owner",
        sortingFn: (a, b) => a.original.owner.name.localeCompare(b.original.owner.name),
        meta: Eu5DataTable.meta({ headerLabel: "Owner" }),
        cell: ({ row }) => <EntityLink entity={row.original.owner} backLabel={BACK_LABEL} />,
      }),
      columnHelper.accessor("development", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Dev", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 1)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("population", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Pop", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatInt(info.getValue())}</Eu5DataTable.NumericCell>
        ),
      }),
    ],
    [nav, panToEntity],
  );

  return (
    <Eu5DataTable
      className="w-full"
      columns={columns}
      data={locations}
      initialSorting={[{ id: "rgoLevel", desc: true }]}
      pagination
    />
  );
}
