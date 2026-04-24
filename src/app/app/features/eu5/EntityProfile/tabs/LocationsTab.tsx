import { useEu5Engine, useEu5MapMode, useEu5SelectionState } from "../../store";
import { useEu5Trigger } from "../useEu5Trigger";
import { usePanToEntity } from "../../usePanToEntity";
import { formatFloat, formatInt } from "@/lib/format";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";
import type { LocationRow, MapMode } from "@/wasm/wasm_eu5";
import type { Row } from "@tanstack/react-table";
import { EntityLink } from "../EntityLink";
import { usePanelNav } from "../PanelNavContext";

const columnHelper = createColumnHelper<LocationRow>();

function NameCell({ row }: { row: Row<LocationRow> }) {
  const engine = useEu5Engine();
  const nav = usePanelNav();
  const panToEntity = usePanToEntity();
  return (
    <button
      type="button"
      onClick={() => {
        panToEntity(row.original.locationIdx);
        if (nav.stack.length > 0) {
          nav.pushMany([
            { kind: "focus", locationIdx: row.original.locationIdx, label: row.original.name },
          ]);
        } else {
          void engine.trigger.setFocusedLocation(row.original.locationIdx);
        }
      }}
      className="min-w-0 truncate text-left text-xs text-sky-300 hover:text-sky-200 hover:underline"
    >
      {row.original.name}
    </button>
  );
}

const columns = [
  columnHelper.accessor("name", {
    sortingFn: "text",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Location" />,
    cell: ({ row }) => <NameCell row={row} />,
  }),
  columnHelper.accessor("development", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Dev" />,
    meta: { className: "text-right" },
    cell: (info) => formatFloat(info.getValue(), 1),
  }),
  columnHelper.accessor("population", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Pop" />,
    meta: { className: "text-right" },
    cell: (info) => formatInt(info.getValue()),
  }),
  columnHelper.accessor("control", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Control" />,
    meta: { className: "text-right" },
    cell: (info) => formatFloat(info.getValue(), 2),
  }),
  columnHelper.accessor("possibleTax", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Possible Tax" />,
    meta: { className: "text-right" },
    cell: (info) => formatFloat(info.getValue(), 2),
  }),
  columnHelper.accessor("tax", {
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Current Tax" />,
    meta: { className: "text-right" },
    cell: (info) => formatFloat(info.getValue(), 2),
  }),
  columnHelper.accessor((row) => row.possibleTax - row.tax, {
    id: "taxGap",
    sortingFn: "basic",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Tax Gap" />,
    meta: { className: "text-right" },
    cell: (info) => formatFloat(info.getValue(), 2),
  }),
  columnHelper.accessor((row) => row.owner?.name ?? "", {
    id: "owner",
    sortingFn: "text",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Owner" />,
    cell: ({ row }) => (row.original.owner ? <EntityLink entity={row.original.owner} /> : null),
  }),
  columnHelper.accessor((row) => row.market?.name ?? "", {
    id: "market",
    sortingFn: "text",
    header: ({ column }) => <Table.ColumnHeader column={column} title="Market" />,
    cell: ({ row }) => (row.original.market ? <EntityLink entity={row.original.market} /> : null),
  }),
];

const SORT_BY_MODE: Partial<Record<MapMode, { id: string; desc: boolean }>> = {
  development: { id: "development", desc: true },
  population: { id: "population", desc: true },
  control: { id: "control", desc: true },
  rgoLevel: { id: "development", desc: true },
  buildingLevels: { id: "development", desc: true },
  possibleTax: { id: "possibleTax", desc: true },
  taxGap: { id: "taxGap", desc: true },
  stateEfficacy: { id: "development", desc: true },
  political: { id: "owner", desc: false },
  markets: { id: "market", desc: false },
  religion: { id: "name", desc: false },
};

export function LocationsTab({ anchorIdx }: { anchorIdx?: number } = {}) {
  const selection = useEu5SelectionState();
  const anchor = selection?.derivedEntityAnchor;
  const mode = useEu5MapMode();

  const { data, loading } = useEu5Trigger(
    (engine) =>
      anchorIdx != null
        ? engine.trigger.getLocationsSectionFor(anchorIdx)
        : engine.trigger.getLocationsSection(),
    [anchor, anchorIdx],
  );

  if (loading && !data) {
    return <div className="h-24 animate-pulse rounded bg-white/5" />;
  }
  if (!data) return null;

  const sort = SORT_BY_MODE[mode] ?? { id: "development", desc: true };

  return (
    <DataTable
      key={mode}
      columns={columns}
      data={data.locations}
      initialSorting={[sort]}
      pagination
    />
  );
}
