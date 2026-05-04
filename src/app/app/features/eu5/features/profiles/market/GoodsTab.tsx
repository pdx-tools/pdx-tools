import { useMemo, useState } from "react";
import {
  GoodsPressureChart,
  GoodsPriceVsBaseChart,
  MarketGoodDetail,
} from "../../insights/Markets";
import type { GoodsPressureMetric } from "../../insights/Markets";
import { useEu5Trigger } from "../useEu5Trigger";
import { ToggleGroup } from "@/components/ToggleGroup";
import { formatFloat, formatInt } from "@/lib/format";
import type { ScopedGoodSummary } from "@/wasm/wasm_eu5";

const TRADE_CATEGORIES = new Set(["Trade", "BurgherTrades"]);

const CONSTRUCTION_CATEGORIES = new Set(["Construction"]);

function isTradeCategory(cat: string): boolean {
  return TRADE_CATEGORIES.has(cat);
}

function isNonTradeNonConstructionCategory(cat: string): boolean {
  return !TRADE_CATEGORIES.has(cat) && !CONSTRUCTION_CATEGORIES.has(cat);
}

type ImportRow = {
  name: string;
  colorHex: string;
  unmetUnits: number;
  unmetValue: number;
};

type ExportRow = {
  name: string;
  colorHex: string;
  shippedUnits: number;
  shippedValue: number;
};

function computeImportRows(goods: ScopedGoodSummary[]): ImportRow[] {
  const rows: ImportRow[] = [];
  for (const g of goods) {
    const demanded = g.demandedBreakdown
      .filter((e) => isNonTradeNonConstructionCategory(e.category))
      .reduce((sum, e) => sum + e.amount, 0);
    const taken = g.takenBreakdown
      .filter((e) => isNonTradeNonConstructionCategory(e.category))
      .reduce((sum, e) => sum + e.amount, 0);
    const unmetUnits = Math.max(0, demanded - taken);
    if (unmetUnits < 0.0001) continue;
    const price = g.weightedPrice > 0 ? g.weightedPrice : (g.defaultMarketPrice ?? 0);
    rows.push({
      name: g.name,
      colorHex: g.colorHex,
      unmetUnits,
      unmetValue: unmetUnits * price,
    });
  }
  return rows;
}

function computeExportRows(goods: ScopedGoodSummary[]): ExportRow[] {
  const rows: ExportRow[] = [];
  for (const g of goods) {
    const shippedUnits = g.takenBreakdown
      .filter((e) => isTradeCategory(e.category))
      .reduce((sum, e) => sum + e.amount, 0);
    if (shippedUnits < 0.0001) continue;
    const price = g.weightedPrice > 0 ? g.weightedPrice : (g.defaultMarketPrice ?? 0);
    rows.push({
      name: g.name,
      colorHex: g.colorHex,
      shippedUnits,
      shippedValue: shippedUnits * price,
    });
  }
  return rows;
}

function GoodDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color || "#64748b" }}
    />
  );
}

function SummaryTable({
  rows,
  metric,
}: {
  rows: { name: string; colorHex: string; primaryUnits: number; primaryValue: number }[];
  metric: GoodsPressureMetric;
}) {
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        metric === "units" ? b.primaryUnits - a.primaryUnits : b.primaryValue - a.primaryValue,
      ),
    [rows, metric],
  );

  if (sorted.length === 0) {
    return <p className="py-3 text-center text-sm text-game-ink-500">None</p>;
  }

  const topValue =
    metric === "units"
      ? Math.max(1, sorted[0]?.primaryUnits ?? 1)
      : Math.max(1, sorted[0]?.primaryValue ?? 1);

  return (
    <div className="flex flex-col gap-0.5">
      {sorted.map((row) => {
        const primary = metric === "units" ? row.primaryUnits : row.primaryValue;
        const secondary = metric === "units" ? row.primaryValue : row.primaryUnits;
        const barPct = (primary / topValue) * 100;
        return (
          <div key={row.name} className="flex items-center gap-2 rounded px-2 py-1">
            <GoodDot color={row.colorHex} />
            <span className="w-28 shrink-0 truncate text-xs font-semibold text-game-ink-100">
              {row.name}
            </span>
            <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-game-panel-hover">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-current opacity-70"
                style={{ width: `${barPct}%`, color: row.colorHex || "#64748b" }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-xs font-semibold text-game-ink-100">
              {metric === "units" ? formatFloat(primary, 1) : `$${formatInt(primary)}`}
            </span>
            <span className="text-game-ink-400 w-16 shrink-0 text-right text-xs">
              {metric === "units" ? `$${formatInt(secondary)}` : formatFloat(secondary, 1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ImportExportSummary({
  goods,
  metric,
}: {
  goods: ScopedGoodSummary[];
  metric: GoodsPressureMetric;
}) {
  const importRows = useMemo(() => computeImportRows(goods), [goods]);
  const exportRows = useMemo(() => computeExportRows(goods), [goods]);

  const importTableRows = useMemo(
    () =>
      importRows.map((r) => ({
        name: r.name,
        colorHex: r.colorHex,
        primaryUnits: r.unmetUnits,
        primaryValue: r.unmetValue,
      })),
    [importRows],
  );

  const exportTableRows = useMemo(
    () =>
      [...exportRows]
        .sort((a, b) => b.shippedUnits - a.shippedUnits)
        .slice(0, 10)
        .map((r) => ({
          name: r.name,
          colorHex: r.colorHex,
          primaryUnits: r.shippedUnits,
          primaryValue: r.shippedValue,
        })),
    [exportRows],
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="flex flex-col gap-2 rounded-lg border border-game-line bg-game-panel p-3">
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-game-ink-500 uppercase">
            Required imports
          </p>
          <p className="text-game-ink-400 mt-0.5 text-[10px]">
            Imports required to meet pop and building needs
          </p>
        </div>
        <SummaryTable rows={importTableRows} metric={metric} />
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-game-line bg-game-panel p-3">
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-game-ink-500 uppercase">
            Exports shipped out
          </p>
          <p className="text-game-ink-400 mt-0.5 text-[10px]">
            Top exports shipped to other markets
          </p>
        </div>
        <SummaryTable rows={exportTableRows} metric={metric} />
      </section>
    </div>
  );
}

export function MarketGoodsTabContent({ anchorLocationIdx }: { anchorLocationIdx: number }) {
  const [selectedGoodName, setSelectedGoodName] = useState<string | null>(null);
  const [metric, setMetric] = useState<GoodsPressureMetric>("units");
  const { data: goods, loading } = useEu5Trigger(
    (engine) => engine.trigger.getMarketGoodsProfile(anchorLocationIdx),
    [anchorLocationIdx],
  );

  const sortedGoods = useMemo(
    () => [...(goods ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [goods],
  );
  const defaultGood = useMemo(() => {
    let best = null as (typeof sortedGoods)[number] | null;
    let bestPct = -Infinity;
    for (const g of sortedGoods) {
      if (!g.defaultMarketPrice || g.defaultMarketPrice <= 0) continue;
      const pct = (g.weightedPrice - g.defaultMarketPrice) / g.defaultMarketPrice;
      if (pct > bestPct) {
        bestPct = pct;
        best = g;
      }
    }
    return best;
  }, [sortedGoods]);

  if (loading && !goods) {
    return <div className="h-64 animate-pulse rounded bg-game-panel-hover" />;
  }

  if (!goods || goods.length === 0) {
    return <p className="py-6 text-center text-sm text-game-ink-500">No market goods data.</p>;
  }

  const selectedGood =
    sortedGoods.find((good) => good.name === selectedGoodName) ?? defaultGood ?? sortedGoods[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          type="single"
          value={metric}
          onValueChange={(value) => {
            if (value) setMetric(value as GoodsPressureMetric);
          }}
          className="inline-flex w-fit rounded-md border border-game-line bg-game-panel-hover p-1"
          aria-label="Metric toggle"
        >
          <ToggleGroup.Item value="units">Units</ToggleGroup.Item>
          <ToggleGroup.Item value="value">Value</ToggleGroup.Item>
        </ToggleGroup>
      </div>

      <ImportExportSummary goods={goods} metric={metric} />

      <GoodsPressureChart
        goods={goods}
        selectedGoodName={selectedGood?.name}
        onGoodSelect={(good) => setSelectedGoodName(good.name)}
        metric={metric}
        onMetricChange={setMetric}
      />
      <GoodsPriceVsBaseChart
        goods={goods}
        selectedGoodName={selectedGood?.name}
        onGoodSelect={(good) => setSelectedGoodName(good.name)}
      />
      {selectedGood && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-semibold tracking-widest text-game-ink-500 uppercase">
              Selected good diagnostic
            </p>
            <select
              value={selectedGood.name}
              onChange={(event) => setSelectedGoodName(event.target.value)}
              className="rounded-md border border-game-line bg-game-panel-hover px-2 py-1 text-xs font-semibold text-game-ink-100"
              aria-label="Selected market good"
            >
              {sortedGoods.map((good) => (
                <option key={good.name} value={good.name}>
                  {good.name}
                </option>
              ))}
            </select>
          </div>
          <MarketGoodDetail good={selectedGood} />
        </section>
      )}
    </div>
  );
}
