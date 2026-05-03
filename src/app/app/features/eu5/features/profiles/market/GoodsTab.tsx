import { useMemo, useState } from "react";
import {
  GoodsPressureChart,
  GoodsPriceVsBaseChart,
  MarketGoodDetail,
} from "../../insights/Markets";
import { useEu5Trigger } from "../useEu5Trigger";

export function MarketGoodsTabContent({ anchorLocationIdx }: { anchorLocationIdx: number }) {
  const [selectedGoodName, setSelectedGoodName] = useState<string | null>(null);
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
      <GoodsPressureChart
        goods={goods}
        selectedGoodName={selectedGood?.name}
        onGoodSelect={(good) => setSelectedGoodName(good.name)}
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
