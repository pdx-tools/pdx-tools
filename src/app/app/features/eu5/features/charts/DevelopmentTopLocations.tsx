import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Eu5DataTable } from "../../components";
import { Table } from "@/components/Table";
import type { DevTopLocation } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { locationProfileEntry, usePanelNav } from "../../EntityProfile/PanelNavContext";
import { usePanToEntity } from "../../usePanToEntity";
import { EntityLink } from "../../EntityProfile/EntityLink";

const BACK_LABEL = "Development";

const columnHelper = createColumnHelper<DevTopLocation>();

interface Props {
  locations: DevTopLocation[];
}

export function DevelopmentTopLocations({ locations }: Props) {
  const nav = usePanelNav();
  const panToEntity = usePanToEntity();

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        sortingFn: "text",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Location" />,
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
      columnHelper.accessor("development", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Development" />,
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 1),
      }),
      columnHelper.accessor("owner", {
        id: "owner",
        sortingFn: (a, b) => a.original.owner.name.localeCompare(b.original.owner.name),
        header: ({ column }) => <Table.ColumnHeader column={column} title="Owner" />,
        cell: ({ row }) => <EntityLink entity={row.original.owner} backLabel={BACK_LABEL} />,
      }),
      columnHelper.accessor("population", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Population" />,
        meta: { className: "text-right" },
        cell: (info) => formatInt(info.getValue()),
      }),
      columnHelper.accessor("control", {
        sortingFn: "basic",
        header: ({ column }) => <Table.ColumnHeader column={column} title="Control" />,
        meta: { className: "text-right" },
        cell: (info) => formatFloat(info.getValue(), 2),
      }),
    ],
    [nav, panToEntity],
  );

  return <Eu5DataTable className="w-full" columns={columns} data={locations} pagination={true} />;
}
