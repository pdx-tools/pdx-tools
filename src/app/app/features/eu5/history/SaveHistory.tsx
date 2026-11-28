import { useMemo, useState } from "react";
import { GameButton } from "@/components/game/Button";
import type { MapMode } from "@/wasm/wasm_eu5";
import { GoodSelect } from "../components/GoodSelect";
import { GameSelect } from "../components/Select";
import { useEu5Trigger } from "../features/profiles/useEu5Trigger";
import { useEu5PlaythroughId } from "../store";
import { ContextGraphs } from "./ContextGraphs";
import { CountryPicker } from "./CountryPicker";
import type { CountryChoice } from "./CountryPicker";
import { HistoryChart } from "./HistoryChart";
import type { HistoryLine } from "./HistoryChart";
import { MarketPicker } from "./MarketPicker";
import { eu5Analysis } from "./analysisClient";
import { useMapHistory } from "./context";
import { useCurrentHistorySnapshot } from "./currentSnapshot";
import { useHistory } from "./store";
import { useCampaignQuery } from "./useCampaignQuery";
import { marketChartMetrics, useMarketHistory, useModeHistory } from "./useHistorySeries";
import type { MarketChartMetric } from "./useHistorySeries";

const marketMetricLabels: Record<MarketChartMetric, string> = {
  price: "Price",
  supply: "Supply",
  demand: "Demand",
  stockpile: "Stockpile",
};
const catalogQuery = { kind: "analyticsCatalog" } as const;
const labelFor = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^\w/, (s) => s.toUpperCase());

export function SaveHistory({
  mode,
  modeTitle,
  focusCountryId,
  focusName,
  focusMarketCenter,
  focusPending = false,
}: {
  mode: MapMode;
  modeTitle?: string;
  focusCountryId?: number;
  focusName?: string;
  focusMarketCenter?: number;
  focusPending?: boolean;
}) {
  const campaignId = useEu5PlaythroughId();
  const mapHistory = useMapHistory();
  const selected = useCurrentHistorySnapshot();
  const snapshots = useHistory((state) => state.snapshots);
  const busy = useHistory((state) => state.progress !== null);
  const [country, setCountry] = useState<number>();
  const [good, setGood] = useState("");
  const [markets, setMarkets] = useState<number[]>([]);
  const [metric, setMetric] = useState<MarketChartMetric>("price");
  const [showCombinedPrice, setShowCombinedPrice] = useState(false);
  const [indexed, setIndexed] = useState(false);
  const marketMode = mode === "markets";

  const catalog = useCampaignQuery(
    campaignId,
    catalogQuery,
    (campaignId, identity, sequence, ids) =>
      eu5Analysis.query({
        campaignId,
        selection: { kind: "ids", ids },
        identity,
        sequence,
        query: catalogQuery,
      }),
  );
  const { data: localCountries } = useEu5Trigger(({ queries }) => queries.getCountryNames(), []);
  const goods = catalog.result?.goods;
  const activeGood = marketMode
    ? goods?.includes(good)
      ? good
      : (goods?.find((value) => value === "wheat" || value === "grain") ?? goods?.[0])
    : undefined;
  const countries = useMemo<CountryChoice[]>(() => {
    const names = new Map(localCountries?.map((entry) => [entry.countryId, entry.name]));
    const raw = (catalog.result?.countries ?? []).map(({ countryId, tag }) => ({
      countryId,
      tag,
      baseName: names.get(countryId) ?? tag,
    }));
    const counts = new Map<string, number>();
    for (const entry of raw) counts.set(entry.baseName, (counts.get(entry.baseName) ?? 0) + 1);
    return raw
      .map(({ countryId, tag, baseName }) => ({
        countryId,
        tag,
        name: (counts.get(baseName) ?? 0) > 1 ? `${baseName} (#${countryId})` : baseName,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [catalog.result, localCountries]);
  const selectedCountry = countries.find((item) => item.countryId === country);
  const countryId = !marketMode ? (focusCountryId ?? selectedCountry?.countryId) : undefined;
  const countryName = focusName ?? countries.find((item) => item.countryId === countryId)?.name;
  const restrictToCountry =
    marketMode && focusCountryId !== undefined && focusMarketCenter === undefined;
  const centerQuery = useCampaignQuery(
    campaignId,
    { kind: "countryMarketCenters", countryId: focusCountryId },
    (campaignId, identity, sequence, ids) =>
      eu5Analysis.query({
        campaignId,
        selection: { kind: "ids", ids },
        identity,
        sequence,
        query: { kind: "countryMarketCenters", countryId: focusCountryId ?? 0 },
      }),
    restrictToCountry && !focusPending,
  );
  const marketChoices = useMemo(
    () =>
      (catalog.result?.markets ?? [])
        .filter((market) =>
          focusMarketCenter !== undefined
            ? market.center === focusMarketCenter
            : !restrictToCountry || centerQuery.result?.includes(market.center),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [catalog.result, focusMarketCenter, restrictToCountry, centerQuery.result],
  );
  const activeMarkets = useMemo(
    () =>
      marketChoices.length === 1
        ? marketChoices
        : marketChoices.filter(({ center }) => markets.includes(center)),
    [marketChoices, markets],
  );
  const activeCenters = useMemo(() => activeMarkets.map(({ center }) => center), [activeMarkets]);
  const canCombinePrice = metric === "price" && activeMarkets.length > 1;

  const modeHistory = useModeHistory(campaignId, mode, countryId, !marketMode && !focusPending);
  const marketHistory = useMarketHistory(
    campaignId,
    activeGood,
    activeCenters,
    canCombinePrice && showCombinedPrice,
    marketMode && !focusPending && !!activeGood && activeCenters.length > 0,
  );

  const dates = marketMode ? marketHistory.dates : modeHistory.dates;
  const loading = marketMode ? marketHistory.loading : modeHistory.loading;
  const queryError = marketMode ? marketHistory.error : modeHistory.error;

  const marketCharts = useMemo(() => {
    const names = new Map(activeMarkets.map(({ center, name }) => [center, name]));
    const lines = (key: MarketChartMetric): HistoryLine[] =>
      marketHistory.data.metrics[key].map((series) => ({
        name: names.get(series.key) ?? `Location ${series.key}`,
        raw: series.values,
      }));
    return {
      price: lines("price"),
      supply: lines("supply"),
      demand: lines("demand"),
      stockpile: lines("stockpile"),
    };
  }, [activeMarkets, marketHistory.data.metrics]);

  const primaryLines = useMemo<HistoryLine[]>(() => {
    if (!canCombinePrice || !showCombinedPrice || !marketHistory.data.weightedPrice) {
      return marketCharts[metric];
    }
    return [
      ...marketCharts.price,
      {
        name: "Combined price (volume weighted)",
        dashed: true,
        raw: marketHistory.data.weightedPrice,
      },
    ];
  }, [canCombinePrice, marketCharts, marketHistory.data.weightedPrice, metric, showCombinedPrice]);
  const errorMessage = catalog.error ?? centerQuery.error ?? queryError;

  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
      aria-label="Campaign history"
    >
      <div>
        <h2 className="text-sm font-semibold text-game-ink-100">
          {focusName ? `${focusName} · ` : ""}
          {modeTitle ?? labelFor(mode)} over time
        </h2>
        {dates.length > 0 && (
          <p className="mt-1 text-xs text-game-ink-500">{dates.length} saved dates</p>
        )}
      </div>
      {catalog.result && (
        <>
          {marketMode ? (
            <div className="grid grid-cols-2 gap-3 rounded-panel border border-game-line bg-game-panel-2 p-3">
              <div className="min-w-0 space-y-1 text-xs text-game-ink-300">
                <div>Good</div>
                <GoodSelect
                  value={activeGood}
                  onValueChange={setGood}
                  goods={(goods ?? []).map((key) => ({ key, name: labelFor(key) }))}
                />
              </div>
              <div className="min-w-0 space-y-1 text-xs text-game-ink-300">
                <div>Metric</div>
                <GameSelect
                  value={metric}
                  onValueChange={(value: MarketChartMetric) => setMetric(value)}
                >
                  <GameSelect.Trigger aria-label="Metric">
                    <GameSelect.Value />
                  </GameSelect.Trigger>
                  <GameSelect.Content>
                    {marketChartMetrics.map((key) => (
                      <GameSelect.Item key={key} value={key}>
                        {marketMetricLabels[key]}
                      </GameSelect.Item>
                    ))}
                  </GameSelect.Content>
                </GameSelect>
              </div>
              <MarketPicker
                choices={marketChoices}
                selected={activeMarkets}
                onChange={setMarkets}
              />
              {canCombinePrice && (
                <label className="col-span-2 flex items-center gap-2 text-xs text-game-ink-300">
                  <input
                    type="checkbox"
                    checked={showCombinedPrice}
                    className="accent-game-accent-300"
                    onChange={(event) => setShowCombinedPrice(event.target.checked)}
                  />
                  Show combined volume-weighted price
                </label>
              )}
              <label className="col-span-2 flex items-center gap-2 text-xs text-game-ink-300">
                <input
                  type="checkbox"
                  checked={indexed}
                  className="accent-game-accent-300"
                  onChange={(event) => setIndexed(event.target.checked)}
                />
                Index first observation to 100
              </label>
            </div>
          ) : focusCountryId === undefined ? (
            <CountryPicker countries={countries} selected={selectedCountry} onChange={setCountry} />
          ) : null}
        </>
      )}
      {errorMessage ? (
        <p role="alert" className="text-xs">
          {errorMessage}
        </p>
      ) : focusPending || catalog.loading || centerQuery.loading || loading ? (
        <p role="status" className="text-xs text-game-ink-500">
          Loading campaign history…
        </p>
      ) : !dates.length ? (
        <p className="text-xs text-game-ink-500">
          {marketMode && catalog.result && activeMarkets.length === 0
            ? marketChoices.length
              ? "Select markets to view their history."
              : "No markets are available for this selection."
            : mapHistory?.enabled
              ? "Add and analyze saves to see how this metric changes over time."
              : "Choose Analyze campaign in the left sidebar to see history here."}
        </p>
      ) : (
        <>
          {marketMode && activeGood ? (
            <>
              <HistoryChart
                title={`${labelFor(activeGood)} · ${marketMetricLabels[metric]}`}
                unit={metric === "price" ? "Saved price" : "Saved market units"}
                dates={dates}
                lines={primaryLines}
                selectedId={selected?.id}
                good={activeGood}
                metric={metric}
                indexed={indexed}
              />
              {marketChartMetrics
                .filter((key) => key !== metric)
                .map((key) => (
                  <HistoryChart
                    key={key}
                    title={`${labelFor(activeGood)} · ${marketMetricLabels[key]}`}
                    unit={key === "price" ? "Saved price" : "Saved market units"}
                    dates={dates}
                    lines={marketCharts[key]}
                    selectedId={selected?.id}
                    good={activeGood}
                    metric={key}
                    indexed={indexed}
                  />
                ))}
            </>
          ) : (
            <ContextGraphs
              dates={dates}
              data={modeHistory.data}
              mode={mode}
              countryId={countryId}
              countryName={countryName}
              selectedId={selected?.id}
            />
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <GameButton
          disabled={busy || !snapshots.length || !mapHistory || mapHistory.opening}
          onClick={() => void mapHistory?.clearCampaign()}
        >
          Clear campaign analysis
        </GameButton>
      </div>
    </section>
  );
}
