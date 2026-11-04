import { cx } from "class-variance-authority";
import { usePanToEntity } from "../../../usePanToEntity";
import { levelBody } from "../../../stack/levelBody";
import { Finding } from "../../../stack/parts";
import { topShareFinding } from "../../../stack/selection";
import { formatExactPercent, formatFixed, formatFixedPercent } from "@/lib/format";
import { createColumnHelper } from "@/lib/tanstack-table";
import { Eu5DataTable, Eu5MapDataTable } from "../../../components";
import type { LocationRow, MapMode, MarketRef } from "@/wasm/wasm_eu5";
import type { AppRow } from "@/lib/tanstack-table";
import { MarketLink } from "../EntityLink";
import { locationProfileEntry, usePanelNav } from "../PanelNavContext";
import { LocationLink } from "../LocationLink";
import { LocationDistributionChart } from "../../insights/LocationDistributionChart";
import { bucketLocations } from "../../insights/bucketLocations";

const columnHelper = createColumnHelper<LocationRow>();

/** The column head says "Market", so the cell has the name alone and it fits in full. */
const shortMarketName = (market: MarketRef) => market.market.name.replace(/ Market$/, "");

function NameCell({ row }: { row: AppRow<LocationRow> }) {
  const nav = usePanelNav();
  const panToEntity = usePanToEntity();
  return (
    <LocationLink
      location={row.original.location}
      className="flex max-w-full text-xs"
      onActivate={(location) => {
        panToEntity(location.key);
        nav.open(locationProfileEntry(location.key, location.name));
      }}
    />
  );
}

// One number of decimals for each column, so that place values align. The
// tax base is in the gap (wealth less tax base).
const columns = [
  columnHelper.accessor("location", {
    id: "location",
    sortFn: "text",
    meta: Eu5DataTable.meta({ headerLabel: "Location", variant: "pin" }),
    cell: ({ row }) => <NameCell row={row} />,
  }),
  columnHelper.accessor("development", {
    sortFn: "basic",
    meta: Eu5DataTable.meta({ headerLabel: "Dev", variant: "num" }),
    cell: (info) => (
      <Eu5DataTable.NumericCell>{formatFixed(info.getValue(), 1)}</Eu5DataTable.NumericCell>
    ),
  }),
  columnHelper.accessor("population", {
    sortFn: "basic",
    meta: Eu5DataTable.meta({ headerLabel: "Pop", variant: "num" }),
    cell: (info) => (
      <Eu5DataTable.NumericCell>{formatFixed(info.getValue(), 0)}</Eu5DataTable.NumericCell>
    ),
  }),
  columnHelper.accessor("control", {
    sortFn: "basic",
    meta: Eu5DataTable.meta({ headerLabel: "Control", variant: "num", exact: formatExactPercent }),
    cell: (info) => (
      <Eu5DataTable.NumericCell>{formatFixedPercent(info.getValue())}</Eu5DataTable.NumericCell>
    ),
  }),
  columnHelper.accessor("wealth", {
    sortFn: "basic",
    meta: Eu5DataTable.meta({ headerLabel: "Wealth", variant: "num" }),
    cell: (info) => (
      <Eu5DataTable.NumericCell>{formatFixed(info.getValue(), 0)}</Eu5DataTable.NumericCell>
    ),
  }),
  columnHelper.accessor((row) => row.wealth - row.taxBase, {
    id: "unrealizedTaxBase",
    sortFn: "basic",
    meta: Eu5DataTable.meta({ headerLabel: "Tax Gap", variant: "num" }),
    cell: (info) => (
      <Eu5DataTable.NumericCell>{formatFixed(info.getValue(), 1)}</Eu5DataTable.NumericCell>
    ),
  }),
  columnHelper.accessor((row) => row.market?.market.name ?? "", {
    id: "market",
    sortFn: "text",
    meta: Eu5DataTable.meta({ headerLabel: "Market" }),
    cell: ({ row }) =>
      row.original.market ? (
        <MarketLink
          market={row.original.market}
          aligned
          label={shortMarketName(row.original.market)}
        />
      ) : null,
  }),
];

const SORT_BY_MODE: Partial<Record<MapMode, { id: string; desc: boolean }>> = {
  development: { id: "development", desc: true },
  population: { id: "population", desc: true },
  control: { id: "control", desc: true },
  rgoLevel: { id: "development", desc: true },
  buildingLevels: { id: "development", desc: true },
  wealth: { id: "wealth", desc: true },
  unrealizedTaxBase: { id: "unrealizedTaxBase", desc: true },
  stateEfficacy: { id: "development", desc: true },
  political: { id: "development", desc: true },
  markets: { id: "market", desc: false },
  religion: { id: "location", desc: false },
  populationGrowth: { id: "population", desc: true },
};

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

  const finding = topShareFinding(
    "locations",
    "development",
    locations.map((location) => location.development),
  );

  return (
    <div className="@container flex flex-col">
      {finding ? <Finding>{finding}</Finding> : null}
      <div className={cx(levelBody, "grid grid-cols-1 gap-4 @[640px]:grid-cols-2")}>
        <LocationDistributionChart distribution={developmentDistribution} />
        <LocationDistributionChart distribution={controlDistribution} />
      </div>
      <Eu5MapDataTable
        key={mode}
        flush
        columns={columns}
        data={locations}
        getRowHoverTarget={(row) => ({ kind: "location", locationIdx: row.location.key })}
        initialSorting={[sort]}
        pagination
      />
    </div>
  );
}
