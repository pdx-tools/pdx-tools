import { useMemo } from "react";
import type { CountryGoodProduction } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { createColumnHelper } from "@/lib/tanstack-table";
import { formatPercent } from "../../insights/GoodProducers";
import { Eu5Icon } from "../../../components/icons/Eu5Icon";
import { EmptyNote, Eu5DataTable, SectionTitle, StatRail } from "../../../components";
import { useEu5Trigger } from "../useEu5Trigger";
import { ProfileSkeleton } from "../ProfileSkeleton";

type GoodRow = CountryGoodProduction & {
  worldShare: number;
  buildingShare: number;
};

const columnHelper = createColumnHelper<GoodRow>();

export function CountryProductionTabContent({ countryIdx }: { countryIdx: number }) {
  const { data, loading } = useEu5Trigger(
    (engine) => engine.queries.getCountryProductionProfile(countryIdx),
    [countryIdx],
  );

  if (loading && !data) return <ProfileSkeleton />;
  if (!data) return null;

  const share = data.worldBaseValue > 0 ? data.baseValue / data.worldBaseValue : 0;
  // Rank 0 means the country makes nothing. Show no rank then.
  const worldRank = data.worldRank > 0 ? data.worldRank : undefined;

  return (
    <div className="flex flex-col gap-4">
      <StatRail title="Production">
        <StatRail.Row
          label="Value (base price)"
          value={`$${formatInt(data.baseValue)}`}
          rank={worldRank}
        />
        <StatRail.Row label="Value (market price)" value={`$${formatInt(data.marketValue)}`} />
        <StatRail.Row label="Share of world" value={formatPercent(share)} bar={share} />
      </StatRail>

      {data.goods.length === 0 ? (
        <EmptyNote>This country makes no goods.</EmptyNote>
      ) : (
        <>
          <section>
            <SectionTitle>Goods</SectionTitle>
            <GoodsTable goods={data.goods} />
          </section>
          <p className="text-[11px] text-game-ink-500">
            Market totals come from the save. The save does not record what each location makes, so
            the split between countries is estimated from RGO size and building level.
          </p>
        </>
      )}
    </div>
  );
}

function GoodsTable({ goods }: { goods: CountryGoodProduction[] }) {
  const rows = useMemo(
    (): GoodRow[] =>
      goods.map((good) => ({
        ...good,
        worldShare: good.worldUnits > 0 ? good.units / good.worldUnits : 0,
        buildingShare: good.units > 0 ? good.buildingUnits / good.units : 0,
      })),
    [goods],
  );

  const hasBothSources = goods.some((good) => good.rawMaterialUnits > 0 && good.buildingUnits > 0);

  const columns = useMemo(
    () => [
      columnHelper.accessor("good", {
        id: "good",
        sortFn: (a, b) => a.original.good.name.localeCompare(b.original.good.name),
        meta: Eu5DataTable.meta({ headerLabel: "Good", variant: "pin" }),
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5">
            <Eu5Icon family="goods" id={row.original.good.key} size="sm" />
            <span>{row.original.good.name}</span>
          </span>
        ),
      }),
      columnHelper.accessor("units", {
        id: "units",
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Units", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFloat(info.getValue(), 1)}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("baseValue", {
        id: "baseValue",
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Value (base)", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>${formatInt(info.getValue())}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("marketValue", {
        id: "marketValue",
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Market value", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>${formatInt(info.getValue())}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.accessor("worldShare", {
        id: "worldShare",
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "World share", variant: "num" }),
        cell: (info) => (
          <div className="flex items-center justify-end gap-2">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-game-panel-hover">
              <div
                className="h-full rounded-full bg-game-ink-300"
                style={{ width: `${info.getValue() * 100}%` }}
              />
            </div>
            <Eu5DataTable.NumericCell>{formatPercent(info.getValue())}</Eu5DataTable.NumericCell>
          </div>
        ),
      }),
      columnHelper.accessor("rank", {
        id: "rank",
        sortFn: "basic",
        // The first click sorts the best rank first.
        sortDescFirst: false,
        meta: Eu5DataTable.meta({ headerLabel: "Rank", variant: "num" }),
        cell: ({ row }) => (
          <Eu5DataTable.NumericCell
            title={`#${row.original.rank} of ${row.original.producerCount} producers`}
          >
            #{formatInt(row.original.rank)}
          </Eu5DataTable.NumericCell>
        ),
      }),
      ...(hasBothSources
        ? [
            columnHelper.accessor("buildingShare", {
              id: "buildingShare",
              sortFn: "basic",
              meta: Eu5DataTable.meta({ headerLabel: "From buildings", variant: "num" }),
              cell: (info) => (
                <Eu5DataTable.NumericCell>
                  {formatPercent(info.getValue())}
                </Eu5DataTable.NumericCell>
              ),
            }),
          ]
        : []),
    ],
    [hasBothSources],
  );

  return (
    <Eu5DataTable
      className="w-full"
      columns={columns}
      data={rows}
      initialSorting={[{ id: "baseValue", desc: true }]}
    />
  );
}
