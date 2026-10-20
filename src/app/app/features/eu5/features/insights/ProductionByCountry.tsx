import { useMemo, useState } from "react";
import { createColumnHelper } from "@/lib/tanstack-table";
import type { CountryProductionValue, ProductionByCountryData } from "@/wasm/wasm_eu5";
import { formatInt } from "@/lib/format";
import { useEu5SelectionTrigger, useEu5Trigger } from "../profiles/useEu5Trigger";
import { CountryLink } from "../profiles/EntityLink";
import { Eu5Icon } from "../../components/icons/Eu5Icon";
import { EmptyNote, Eu5DataTable, GameSegmented } from "../../components";
import { Eu5InsightErrorState } from "../Eu5InsightState";
import { formatPercent } from "./GoodProducers";

const BACK_LABEL = "Markets";

type ValueBasis = "base" | "market";

type CountryRow = CountryProductionValue & {
  value: number;
  share: number;
  barWidth: number;
};

const columnHelper = createColumnHelper<CountryRow>();

/** The production value of each country in the selected markets. */
export function ProductionByCountry() {
  const query = useEu5SelectionTrigger((engine) => engine.queries.getProductionByCountry());
  return <ProductionByCountryResult query={query} />;
}

/** The production value of each country in one market. */
export function MarketProductionByCountry({ marketId }: { marketId: number }) {
  const query = useEu5Trigger(
    (engine) => engine.queries.getProductionByCountry(marketId),
    [marketId],
  );
  return <ProductionByCountryResult query={query} />;
}

function ProductionByCountryResult({
  query,
}: {
  query: { data: ProductionByCountryData | undefined; error: Error | undefined };
}) {
  if (query.error) return <Eu5InsightErrorState error={query.error} />;
  if (!query.data) return <div className="h-24" />;
  return <ProductionByCountryView data={query.data} />;
}

function describeScope(data: ProductionByCountryData, isWorld: boolean): string {
  if (data.marketCount === 1) return "This market makes";
  if (isWorld) return "The world makes";
  return `These ${data.marketCount} markets make`;
}

function ProductionByCountryView({ data }: { data: ProductionByCountryData }) {
  const [basis, setBasis] = useState<ValueBasis>("base");
  const isBase = basis === "base";
  const total = isBase ? data.totalBaseValue : data.totalMarketValue;
  const world = isBase ? data.worldBaseValue : data.worldMarketValue;

  const rows = useMemo((): CountryRow[] => {
    const basisValue = (country: CountryProductionValue) =>
      isBase ? country.baseValue : country.marketValue;
    // Bars are relative to the top country.
    const topValue = Math.max(0, ...data.countries.map(basisValue));
    return data.countries.map((country) => {
      const value = basisValue(country);
      return {
        ...country,
        value,
        share: total > 0 ? value / total : 0,
        barWidth: topValue > 0 ? value / topValue : 0,
      };
    });
  }, [data, isBase, total]);

  if (total <= 0) {
    const scope = data.marketCount === 1 ? "this market" : "the selected markets";
    return <EmptyNote>No production in {scope}.</EmptyNote>;
  }

  // The scope holds all recorded production. It is the whole world.
  const isWorld = total >= world;
  const worldShare = world > 0 ? total / world : 0;
  const assigned = rows.reduce((sum, row) => sum + row.value, 0);
  const unassigned = Math.max(0, total - assigned);
  const basisLabel = isBase ? "base price" : "market price";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <GameSegmented
          value={basis}
          onValueChange={(value) => setBasis(value as ValueBasis)}
          aria-label="Value basis"
        >
          <GameSegmented.Item value="base">Base price</GameSegmented.Item>
          <GameSegmented.Item value="market">Market price</GameSegmented.Item>
        </GameSegmented>
      </div>
      <p className="text-[12px] text-game-ink-300">
        {describeScope(data, isWorld)}{" "}
        <span className="font-game-num text-game-ink-100 tabular-nums">${formatInt(total)}</span> a
        month at {basisLabel}
        {!isWorld && (
          <>
            {", "}
            <span className="font-game-num text-game-ink-100 tabular-nums">
              {formatPercent(worldShare)}
            </span>{" "}
            of world production
          </>
        )}
        .
      </p>
      <ProductionTable key={basis} rows={rows} />
      <p className="text-[11px] text-game-ink-500">
        Market totals come from the save. The save does not record what each location makes, so the
        split between countries is estimated from RGO size and building level.
        {unassigned > total * 0.005 &&
          ` $${formatInt(unassigned)} of production has no known source and is not given to a country.`}
      </p>
    </div>
  );
}

function ProductionTable({ rows }: { rows: CountryRow[] }) {
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
      columnHelper.accessor("value", {
        id: "value",
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Value", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>${formatInt(info.getValue())}</Eu5DataTable.NumericCell>
        ),
      }),
      columnHelper.display({
        id: "topGoods",
        header: "Top goods",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1">
            {row.original.topGoods.map((good) => (
              <span key={good.key} title={good.name}>
                <Eu5Icon family="goods" id={good.key} size="sm" alt={good.name} />
              </span>
            ))}
          </span>
        ),
      }),
      columnHelper.accessor("goodCount", {
        id: "goodCount",
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Goods", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatInt(info.getValue())}</Eu5DataTable.NumericCell>
        ),
      }),
    ],
    [],
  );

  if (rows.length === 0) {
    return <EmptyNote>No country could be matched to this production.</EmptyNote>;
  }

  return (
    <Eu5DataTable
      className="w-full"
      columns={columns}
      data={rows}
      initialSorting={[{ id: "value", desc: true }]}
      pagination={rows.length > 25}
    />
  );
}
