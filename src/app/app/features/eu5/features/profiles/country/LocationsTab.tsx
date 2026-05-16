import { useEu5Engine } from "../../../store";
import { usePanToEntity } from "../../../usePanToEntity";
import { formatFloat, formatInt } from "@/lib/format";
import { createColumnHelper } from "@tanstack/react-table";
import { Eu5DataTable } from "../../../components";
import type { LocationDistribution, LocationRow, MapMode } from "@/wasm/wasm_eu5";
import type { Row } from "@tanstack/react-table";
import { EntityLink } from "../EntityLink";
import { locationProfileEntry, usePanelNav } from "../PanelNavContext";
import { LocationDistributionChart } from "../../insights/LocationDistributionChart";

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
          nav.pushMany([locationProfileEntry(row.original.locationIdx, row.original.name)]);
        } else {
          void engine.trigger.setFocusedLocation(row.original.locationIdx);
        }
      }}
      className="min-w-0 truncate text-left text-xs text-game-accent-300 hover:text-game-accent-100 hover:underline"
    >
      {row.original.name}
    </button>
  );
}

const columns = [
  columnHelper.accessor("name", {
    sortingFn: "text",
    meta: Eu5DataTable.meta({ headerLabel: "Location", variant: "pin" }),
    cell: ({ row }) => <NameCell row={row} />,
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
  columnHelper.accessor("control", {
    sortingFn: "basic",
    meta: Eu5DataTable.meta({ headerLabel: "Control", variant: "num" }),
    cell: (info) => (
      <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 2)}</Eu5DataTable.NumericCell>
    ),
  }),
  columnHelper.accessor("possibleTax", {
    sortingFn: "basic",
    meta: Eu5DataTable.meta({ headerLabel: "Possible Tax", variant: "num" }),
    cell: (info) => (
      <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 2)}</Eu5DataTable.NumericCell>
    ),
  }),
  columnHelper.accessor("tax", {
    sortingFn: "basic",
    meta: Eu5DataTable.meta({ headerLabel: "Current Tax", variant: "num" }),
    cell: (info) => (
      <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 2)}</Eu5DataTable.NumericCell>
    ),
  }),
  columnHelper.accessor((row) => row.possibleTax - row.tax, {
    id: "taxGap",
    sortingFn: "basic",
    meta: Eu5DataTable.meta({ headerLabel: "Tax Gap", variant: "num" }),
    cell: (info) => (
      <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 2)}</Eu5DataTable.NumericCell>
    ),
  }),
  columnHelper.accessor((row) => row.owner?.name ?? "", {
    id: "owner",
    sortingFn: "text",
    meta: Eu5DataTable.meta({ headerLabel: "Owner" }),
    cell: ({ row }) => (row.original.owner ? <EntityLink entity={row.original.owner} /> : null),
  }),
  columnHelper.accessor((row) => row.market?.name ?? "", {
    id: "market",
    sortingFn: "text",
    meta: Eu5DataTable.meta({ headerLabel: "Market" }),
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

function bucketLocations(metricLabel: string, values: number[]): LocationDistribution {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) {
    return { metricLabel, buckets: [], topLocations: [] };
  }

  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  if (Math.abs(max - min) < Number.EPSILON) {
    return {
      metricLabel,
      buckets: [{ lo: min, hi: max, count: finiteValues.length }],
      topLocations: [],
    };
  }

  const targetBuckets = 20;
  const step = niceBucketStep(max - min, targetBuckets);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const bucketCount = Math.max(1, Math.min(targetBuckets * 2, Math.ceil((end - start) / step)));
  const counts = Array.from({ length: bucketCount }, () => 0);

  for (const value of finiteValues) {
    const index = Math.min(bucketCount - 1, Math.floor((value - start) / step));
    counts[index] += 1;
  }

  return {
    metricLabel,
    buckets: counts.map((count, index) => ({
      lo: start + index * step,
      hi: start + (index + 1) * step,
      count,
    })),
    topLocations: [],
  };
}

function niceBucketStep(range: number, targetBuckets: number): number {
  const rawStep = range / Math.max(1, targetBuckets);
  if (rawStep <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}

export function LocationsTabContent({
  locations,
  mode,
}: {
  locations: LocationRow[];
  mode: MapMode;
}) {
  const sort = SORT_BY_MODE[mode] ?? { id: "development", desc: true };

  const developmentDistribution = bucketLocations(
    "Development",
    locations.map((location) => location.development),
  );
  const controlDistribution = bucketLocations(
    "Control (%)",
    locations.map((location) => location.control * 100),
  );

  return (
    <div className="flex flex-col gap-4">
      <LocationDistributionChart distribution={developmentDistribution} />
      <LocationDistributionChart distribution={controlDistribution} />
      <Eu5DataTable
        key={mode}
        columns={columns}
        data={locations}
        initialSorting={[sort]}
        pagination
      />
    </div>
  );
}
