import type { LocationProfile, LocationPopRow } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { createColumnHelper } from "@tanstack/react-table";
import { Eu5DataTable } from "../../../components";
import { PopulationSankey } from "../../insights/Population";

interface Props {
  profile: LocationProfile;
}

const columnHelper = createColumnHelper<LocationPopRow>();

const columns = [
  columnHelper.accessor("kind", {
    sortingFn: "text",
    meta: Eu5DataTable.meta({ headerLabel: "Kind", variant: "pin" }),
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor((row) => row.culture?.name ?? "No culture", {
    id: "culture",
    sortingFn: "text",
    meta: Eu5DataTable.meta({ headerLabel: "Culture" }),
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor((row) => row.religion.name, {
    id: "religion",
    sortingFn: "text",
    meta: Eu5DataTable.meta({ headerLabel: "Religion" }),
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("size", {
    sortingFn: "basic",
    meta: Eu5DataTable.meta({ headerLabel: "Size", variant: "num" }),
    cell: (info) => (
      <Eu5DataTable.NumericCell>{formatInt(info.getValue())}</Eu5DataTable.NumericCell>
    ),
  }),
  columnHelper.accessor("satisfaction", {
    sortingFn: "basic",
    meta: Eu5DataTable.meta({ headerLabel: "Satisfaction", variant: "num" }),
    cell: (info) => (
      <Eu5DataTable.NumericCell>{`${formatFloat(info.getValue() * 100, 1)}%`}</Eu5DataTable.NumericCell>
    ),
  }),
  columnHelper.accessor("literacy", {
    sortingFn: "basic",
    meta: Eu5DataTable.meta({ headerLabel: "Literacy", variant: "num" }),
    cell: (info) => (
      <Eu5DataTable.NumericCell>{`${formatFloat(info.getValue() * 100, 1)}%`}</Eu5DataTable.NumericCell>
    ),
  }),
];

export function LocationPopulationTab({ profile }: Props) {
  const rows = profile.populationProfile;

  if (rows.length === 0) {
    return <p className="text-sm text-game-ink-500">No population data.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <PopulationSankey rows={rows} />
      <Eu5DataTable columns={columns} data={rows} initialSorting={[{ id: "size", desc: true }]} />
    </div>
  );
}
