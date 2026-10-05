import { useMemo } from "react";
import { createColumnHelper } from "@/lib/tanstack-table";
import type { GoodProducer, GoodProducersData, ScopedGoodSummary } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { useEu5SelectionTrigger, useEu5Trigger } from "../profiles/useEu5Trigger";
import { CountryLink } from "../profiles/EntityLink";
import { Eu5Icon } from "../../components/icons/Eu5Icon";
import { EmptyNote, Eu5DataTable, GameSelect } from "../../components";
import { Eu5InsightErrorState } from "../Eu5InsightState";

const BACK_LABEL = "Markets";

/** The value of production at the base price, so that markets compare. */
export function baseProductionValue(good: ScopedGoodSummary): number {
  return good.production * (good.defaultMarketPrice ?? 0);
}

/** Goods made in the scoped markets, by production value. */
export function producedGoods(goods: ScopedGoodSummary[]): ScopedGoodSummary[] {
  return goods
    .filter((good) => good.production > 0)
    .sort((a, b) => baseProductionValue(b) - baseProductionValue(a));
}

function formatPercent(value: number): string {
  return `${formatFloat(value * 100, value < 0.1 ? 1 : 0)}%`;
}

/** The producers of a good in the selected markets, with a good picker. */
export function GoodProducers({
  goods,
  goodKey,
  onGoodChange,
}: {
  goods: ScopedGoodSummary[];
  goodKey: string;
  onGoodChange: (key: string) => void;
}) {
  const producersQuery = useEu5SelectionTrigger(
    (engine) => engine.trigger.getGoodProducers(goodKey),
    [goodKey],
  );

  return (
    <div className="flex flex-col gap-3">
      <GameSelect value={goodKey} onValueChange={onGoodChange}>
        <GameSelect.Trigger aria-label="Good" className="w-56">
          <GameSelect.Value />
        </GameSelect.Trigger>
        <GameSelect.Content className="max-h-80 overflow-y-auto">
          {goods.map((good) => (
            <GameSelect.Item key={good.good.key} value={good.good.key}>
              <span className="inline-flex items-center gap-1.5">
                <Eu5Icon family="goods" id={good.good.key} size="sm" />
                {good.good.name}
              </span>
            </GameSelect.Item>
          ))}
        </GameSelect.Content>
      </GameSelect>
      <ProducersResult query={producersQuery} goodKey={goodKey} />
    </div>
  );
}

/** The producers of a good in one market. */
export function MarketGoodProducers({ marketId, goodKey }: { marketId: number; goodKey: string }) {
  const producersQuery = useEu5Trigger(
    (engine) => engine.trigger.getGoodProducers(goodKey, marketId),
    [goodKey, marketId],
  );
  return <ProducersResult query={producersQuery} goodKey={goodKey} />;
}

function ProducersResult({
  query,
  goodKey,
}: {
  query: { data: GoodProducersData | undefined; error: Error | undefined };
  goodKey: string;
}) {
  // Show nothing for the previous good while the next one loads.
  const data = query.data?.good.key === goodKey ? query.data : undefined;
  if (query.error) return <Eu5InsightErrorState error={query.error} />;
  if (!data) return <div className="h-24" />;
  return <ProducersSummary data={data} />;
}

function ProducersSummary({ data }: { data: GoodProducersData }) {
  if (data.totalUnits <= 0) {
    const scope = data.marketCount === 1 ? "this market" : "the selected markets";
    return (
      <EmptyNote>
        No {data.good.name} is made in {scope}.
      </EmptyNote>
    );
  }

  const price = data.basePrice ?? 0;
  const worldShare = data.worldUnits > 0 ? data.totalUnits / data.worldUnits : 0;
  const sources = [
    { label: "RGOs", units: data.rawMaterialUnits },
    { label: "buildings", units: data.buildingUnits },
    { label: "other", units: data.otherUnits },
  ].filter((source) => source.units > 0);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] text-game-ink-300">
        <span className="font-game-num text-game-ink-100 tabular-nums">
          {formatFloat(data.totalUnits, 1)}
        </span>{" "}
        a month, worth{" "}
        <span className="font-game-num text-game-ink-100 tabular-nums">
          ${formatInt(data.totalUnits * price)}
        </span>{" "}
        at base price.{" "}
        {data.marketCount === 1 ? "This market makes" : `These ${data.marketCount} markets make`}{" "}
        {formatPercent(worldShare)} of world production
        {sources.length > 1 &&
          ` (${sources.map((s) => `${formatPercent(s.units / data.totalUnits)} ${s.label}`).join(", ")})`}
        .
      </p>
      <ProducersTable data={data} />
      <p className="text-[11px] text-game-ink-500">
        Market totals come from the save. The save does not record what each location makes, so the
        split between countries is estimated from RGO size and building employment.
        {data.otherUnits > 0 &&
          ` ${formatFloat(data.otherUnits, 1)} units of base production have no known source and are not given to a country.`}
      </p>
    </div>
  );
}

type ProducerRow = GoodProducer & { share: number; value: number; barWidth: number };

const columnHelper = createColumnHelper<ProducerRow>();

function ProducersTable({ data }: { data: GoodProducersData }) {
  const rows = useMemo((): ProducerRow[] => {
    // Bars are relative to the top producer, so that small shares stay
    // readable when production is spread across many countries.
    const topUnits = Math.max(0, ...data.countries.map((country) => country.units));
    return data.countries.map((country) => ({
      ...country,
      share: country.units / data.totalUnits,
      value: country.units * (data.basePrice ?? 0),
      barWidth: topUnits > 0 ? country.units / topUnits : 0,
    }));
  }, [data]);

  const hasBothSources = data.rawMaterialUnits > 0 && data.buildingUnits > 0;

  const columns = useMemo(
    () => [
      columnHelper.accessor("country", {
        id: "country",
        sortFn: (a, b) =>
          a.original.country.country.name.localeCompare(b.original.country.country.name),
        meta: Eu5DataTable.meta({ headerLabel: "Country", variant: "pin" }),
        cell: ({ row }) => (
          <CountryLink country={row.original.country} aligned backLabel={BACK_LABEL} />
        ),
      }),
      columnHelper.accessor("share", {
        id: "share",
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Share", variant: "num" }),
        cell: (info) => (
          <div className="flex items-center justify-end gap-2">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-game-panel-hover">
              <div
                className="h-full rounded-full bg-game-ink-300"
                style={{ width: `${info.row.original.barWidth * 100}%` }}
              />
            </div>
            <Eu5DataTable.NumericCell>{formatPercent(info.getValue())}</Eu5DataTable.NumericCell>
          </div>
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
      columnHelper.accessor("value", {
        id: "value",
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Value", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>${formatInt(info.getValue())}</Eu5DataTable.NumericCell>
        ),
      }),
      ...(hasBothSources
        ? [
            columnHelper.accessor((row) => row.buildingUnits / row.units, {
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

  if (rows.length === 0) {
    return <EmptyNote>No country could be matched to this production.</EmptyNote>;
  }

  return (
    <Eu5DataTable
      className="w-full"
      columns={columns}
      data={rows}
      initialSorting={[{ id: "share", desc: true }]}
      pagination={rows.length > 25}
    />
  );
}
