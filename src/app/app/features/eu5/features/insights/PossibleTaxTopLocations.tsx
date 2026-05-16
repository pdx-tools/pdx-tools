import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Eu5DataTable, Eu5MapDataTable } from "../../components";
import type { PossibleTaxTopLocation } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { locationProfileEntry, usePanelNav } from "../profiles/PanelNavContext";
import { usePanToEntity } from "../../usePanToEntity";
import { EntityLink } from "../profiles/EntityLink";
import { MapHoverButton } from "../../MapHoverButton";

const BACK_LABEL = "Possible Tax";

const columnHelper = createColumnHelper<PossibleTaxTopLocation>();

interface Props {
  locations: PossibleTaxTopLocation[];
}

export function PossibleTaxTopLocations({ locations }: Props) {
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
            <MapHoverButton
              target={{ kind: "location", locationIdx: loc.locationIdx }}
              className="text-left text-game-accent-300 hover:text-game-accent-100 hover:underline"
              onClick={() => {
                nav.pushMany([locationProfileEntry(loc.locationIdx, loc.name)], BACK_LABEL);
                panToEntity(loc.locationIdx);
              }}
            >
              {loc.name}
            </MapHoverButton>
          );
        },
      }),
      columnHelper.accessor("possibleTax", {
        sortingFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Possible Tax", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 2)}</Eu5DataTable.NumericCell>
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
        sortingFn: (a, b) => a.original.owner.name.localeCompare(b.original.owner.name),
        meta: Eu5DataTable.meta({ headerLabel: "Owner" }),
        cell: ({ row }) => <EntityLink entity={row.original.owner} backLabel={BACK_LABEL} />,
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
      getRowHoverTarget={(row) => ({ kind: "location", locationIdx: row.locationIdx })}
      pagination
    />
  );
}
