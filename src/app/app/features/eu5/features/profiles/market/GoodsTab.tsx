import { Fragment, useMemo, useState } from "react";
import { cx } from "class-variance-authority";
import { focusRingInset } from "@/components/game/focusRing";
import { GoodsPriceVsBaseChart, MarketGoodCharts, MarketGoodStats } from "../../insights/Markets";
import type { GoodsPressureMetric } from "../../insights/Markets";
import { useEu5Trigger } from "../useEu5Trigger";
import { formatMetric } from "@/lib/format";
import type { ScopedGoodSummary } from "@/wasm/wasm_eu5";
import { GameSegmented, SectionTitle, Skeleton } from "../../../components";
import { Eu5Icon } from "../../../components/icons/Eu5Icon";
import { RankRow } from "../../../stack/ModeRanking";
import { sectionLabel } from "@/components/game/SectionTitle";
import {
  Band,
  DivergingBar,
  DivergingHead,
  Finding,
  Note,
  RowCaret,
  ShowMoreRow,
} from "../../../stack/parts";
import { levelBody } from "../../../stack/levelBody";

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
      name: g.good.name,
      colorHex: g.good.colorHex,
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
      name: g.good.name,
      colorHex: g.good.colorHex,
      shippedUnits,
      shippedValue: shippedUnits * price,
    });
  }
  return rows;
}

/** The goods as rows of the column: the metric's figure and the other figure, and no bar */
function SummaryRows({
  label,
  rows,
  metric,
  flush,
}: {
  label: string;
  flush?: boolean;
  rows: { name: string; colorHex: string; primaryUnits: number; primaryValue: number }[];
  metric: GoodsPressureMetric;
}) {
  const primary = (row: (typeof rows)[number]) =>
    metric === "units" ? row.primaryUnits : row.primaryValue;
  const secondary = (row: (typeof rows)[number]) =>
    metric === "units" ? row.primaryValue : row.primaryUnits;
  const sorted = [...rows].sort((a, b) => primary(b) - primary(a));

  return (
    <>
      <Band
        label={label}
        columns={metric === "units" ? "Units / value" : "Value / units"}
        flush={flush}
      />
      {sorted.length === 0 ? (
        <Note>None</Note>
      ) : (
        sorted.map((row) => (
          <RankRow
            key={row.name}
            row={{ key: row.name, name: row.name, color: row.colorHex, value: primary(row) }}
            display={formatMetric(primary(row))}
            dim={formatMetric(secondary(row))}
          />
        ))
      )}
    </>
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
    <>
      <SummaryRows label="Required imports" rows={importTableRows} metric={metric} flush />
      <SummaryRows label="Exports shipped out" rows={exportTableRows} metric={metric} />
    </>
  );
}

function MetricSwitch({
  metric,
  onChange,
  full = false,
}: {
  metric: GoodsPressureMetric;
  onChange: (metric: GoodsPressureMetric) => void;
  /** The switch is alone on its row, so its segments share the row's width */
  full?: boolean;
}) {
  const item = full ? "flex-1 justify-center" : undefined;
  return (
    <GameSegmented
      value={metric}
      onValueChange={(value) => onChange(value as GoodsPressureMetric)}
      aria-label="Goods metric"
      className={full ? "w-full" : undefined}
    >
      <GameSegmented.Item value="value" className={item}>
        Value
      </GameSegmented.Item>
      <GameSegmented.Item value="units" className={item}>
        Units
      </GameSegmented.Item>
    </GameSegmented>
  );
}

/** What the market must import and what it ships out, for the overview */
export function MarketTradeSummary({ marketId }: { marketId: number }) {
  const [metric, setMetric] = useState<GoodsPressureMetric>("value");
  const { data: goods, loading } = useEu5Trigger(
    (engine) => engine.queries.getMarketGoodsProfile(marketId),
    [marketId],
  );

  if (loading && !goods) {
    return (
      <div className={levelBody}>
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (!goods || goods.length === 0) {
    return null;
  }

  return (
    <>
      <div className="border-b border-game-line px-3.5 py-2">
        <MetricSwitch metric={metric} onChange={setMetric} full />
      </div>
      <ImportExportSummary goods={goods} metric={metric} />
    </>
  );
}

/** The goods that a list shows before the reader asks for all of them, in each view */
export const GOODS_SHOWN = 12;

export type GoodBalance = {
  good: ScopedGoodSummary;
  shortage: number;
  surplus: number;
};

function balanceOf(good: ScopedGoodSummary, metric: GoodsPressureMetric): GoodBalance {
  return metric === "value"
    ? { good, shortage: good.shortageValue, surplus: good.surplusValue }
    : { good, shortage: good.shortage, surplus: good.surplus };
}

const imbalance = (row: GoodBalance) => Math.max(row.shortage, row.surplus);

/**
 * The goods of a market by imbalance, the largest first, then by name.
 * The Goods level and the market's caption use this one order.
 */
export function goodsByImbalance(
  goods: readonly ScopedGoodSummary[],
  metric: GoodsPressureMetric,
): GoodBalance[] {
  return goods
    .map((good) => balanceOf(good, metric))
    .sort(
      (a, b) => imbalance(b) - imbalance(a) || a.good.good.name.localeCompare(b.good.good.name),
    );
}

/** An imbalance with its sign: "+" is a surplus and "−" is a shortage. Each level uses this form. */
export function signedImbalance(row: GoodBalance): string {
  const value = imbalance(row);
  if (value <= 0) return "–";
  return `${row.surplus >= row.shortage ? "+" : "\u2212"}${formatMetric(value)}`;
}

/** One line that names the largest shortages and the largest surplus */
function goodsLead(rows: GoodBalance[]): string {
  const names = (list: GoodBalance[]) => list.map((row) => row.good.good.name).join(", ");
  const short = [...rows]
    .filter((row) => row.shortage > 0)
    .sort((a, b) => b.shortage - a.shortage)
    .slice(0, 2);
  const surplus = [...rows]
    .filter((row) => row.surplus > 0)
    .sort((a, b) => b.surplus - a.surplus)
    .slice(0, 2);

  if (short.length === 0 && surplus.length === 0) return "Balanced";
  if (surplus.length === 0) return `Short on ${names(short)}`;
  if (short.length === 0) return `Surplus of ${names(surplus)}`;
  return `Short on ${names(short)}. Surplus of ${names(surplus)}.`;
}

/** On a phone the bar gives way, because a bar that grows first leaves no room for the name. */
const goodRowGrid =
  "grid grid-cols-[16px_minmax(0,1fr)_minmax(120px,200px)_56px] items-center gap-2.5 max-md:grid-cols-[16px_minmax(0,1fr)_116px_56px]";

/**
 * A good as a row: its icon, its name, a bar that diverges from a centre mark
 * (shortage to the left, surplus to the right), and its imbalance. The bar
 * lengths compare the rows, relative to the largest imbalance. The row expands in
 * place, so it has a caret and a hover.
 */
function GoodRow({
  row,
  largest,
  selected,
  open,
  onSelect,
}: {
  row: GoodBalance;
  largest: number;
  selected: boolean;
  open: boolean;
  onSelect: () => void;
}) {
  const shortage = largest > 0 ? row.shortage / largest : 0;
  const surplus = largest > 0 ? row.surplus / largest : 0;
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onSelect}
      className={cx(
        goodRowGrid,
        "group relative h-[30px] w-full cursor-pointer border-b border-game-line-faint pr-6 pl-3.5 text-left max-md:h-11",
        focusRingInset,
        selected ? "bg-game-accent-soft" : "hover:bg-game-panel-hover",
      )}
    >
      <Eu5Icon family="goods" id={row.good.good.key} size="sm" alt="" />
      <span
        className={cx(
          "min-w-0 truncate text-[12.5px]",
          selected ? "text-game-accent-100" : "text-game-ink-100",
        )}
      >
        {row.good.good.name}
      </span>
      <DivergingBar surplus={surplus} shortage={shortage} />
      <span className="text-right font-game-num text-[12px] font-medium text-game-ink-100 tabular-nums">
        {signedImbalance(row)}
      </span>
      <RowCaret open={open} />
    </button>
  );
}

/**
 * Each good of the market. The level leads with the largest shortages and
 * surplus and lists the goods with an imbalance, the largest first. The selected
 * good's figures are directly under its row. The charts come after the list.
 */
export function MarketGoodsTabContent({ marketId }: { marketId: number }) {
  const [selectedGoodKey, setSelectedGoodKey] = useState<string | null>(null);
  const [metric, setMetric] = useState<GoodsPressureMetric>("value");
  const [showAll, setShowAll] = useState(false);
  // The selected good's row can close, and its charts stay under the list.
  const [closed, setClosed] = useState(false);
  const { data: goods, loading } = useEu5Trigger(
    (engine) => engine.queries.getMarketGoodsProfile(marketId),
    [marketId],
  );

  const rows = useMemo(() => goodsByImbalance(goods ?? [], metric), [goods, metric]);

  if (loading && !goods) {
    return (
      <div className={levelBody}>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!goods || goods.length === 0) {
    return <p className="py-6 text-center text-sm text-game-ink-500">No market goods data.</p>;
  }

  const selected = rows.find((row) => row.good.good.key === selectedGoodKey) ?? rows[0];
  const selectedGood = selected?.good;
  // A good with no imbalance has nothing to compare. The chart can still select it.
  const listed = rows.filter((row) => imbalance(row) > 0);
  const shown = showAll ? listed : listed.slice(0, GOODS_SHOWN);
  // The selected good stays in the list when the list is short.
  const shownRows = selected && !shown.includes(selected) ? [...shown, selected] : shown;
  // One scale for both sides: a bar's length is its value, in every row.
  const largest = Math.max(0, ...rows.map(imbalance));
  const hidden = listed.filter((row) => !shownRows.includes(row)).length;

  return (
    <div className="@container">
      <Finding aside={<MetricSwitch metric={metric} onChange={setMetric} />}>
        {goodsLead(rows)}
      </Finding>
      <div className={cx(goodRowGrid, "h-7 bg-game-panel-2 pr-6 pl-3.5")}>
        <span />
        <span className={sectionLabel}>Goods</span>
        <DivergingHead />
        <span />
      </div>
      {shownRows.map((row) => (
        <Fragment key={row.good.good.key}>
          <GoodRow
            row={row}
            largest={largest}
            selected={row === selected}
            open={row === selected && !closed}
            onSelect={() => {
              setClosed(row === selected && !closed);
              setSelectedGoodKey(row.good.good.key);
            }}
          />
          {row === selected && !closed ? <MarketGoodStats good={row.good} flush /> : null}
        </Fragment>
      ))}
      <ShowMoreRow hidden={hidden} expanded={showAll} onToggle={() => setShowAll((x) => !x)} />
      <div className={cx(levelBody, "flex flex-col gap-4")}>
        <div className="grid grid-cols-1 gap-4 @[1100px]:grid-cols-2">
          <section>
            <SectionTitle>Price vs base</SectionTitle>
            <GoodsPriceVsBaseChart
              goods={goods}
              selectedGoodKey={selectedGood?.good.key}
              onGoodSelect={(good) => setSelectedGoodKey(good.good.key)}
            />
          </section>
          {selectedGood ? <MarketGoodCharts good={selectedGood} /> : null}
        </div>
      </div>
    </div>
  );
}
