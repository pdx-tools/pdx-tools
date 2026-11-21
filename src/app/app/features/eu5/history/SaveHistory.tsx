import { useMemo, useState } from "react";
import { GameButton } from "@/components/game/Button";
import { downloadData } from "@/lib/downloadData";
import type { MapMode } from "@/wasm/wasm_eu5";
import { GoodSelect } from "../components/GoodSelect";
import { GameSelect } from "../components/Select";
import { useEu5PlaythroughId } from "../store";
import { ContextGraphs } from "./ContextGraphs";
import { CountryPicker } from "./CountryPicker";
import { HistoryChart } from "./HistoryChart";
import { MarketPicker } from "./MarketPicker";
import { eu5Analysis } from "./analysisClient";
import { useMapHistory } from "./context";
import { useCurrentHistorySnapshot } from "./currentSnapshot";
import { marketObservation, weightedMarketPrice } from "./observations";
import { useHistory } from "./store";
import { useCampaignQuery } from "./useCampaignQuery";
import { useHistoryObservations } from "./useHistoryObservations";

const marketMetrics = {
  price: "Price",
  supply: "Supply",
  demand: "Demand",
  stockpile: "Stockpile",
} as const;
type MarketMetric = keyof typeof marketMetrics;
const catalogQuery = { kind: "analyticsCatalog" } as const;
const marketMetricKeys = Object.keys(marketMetrics) as MarketMetric[];
const labelFor = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^\w/, (s) => s.toUpperCase());

export function SaveHistory({
  mode,
  focusCountryId,
  focusName,
  focusMarketCenter,
}: {
  mode: MapMode;
  focusCountryId?: number;
  focusName?: string;
  focusMarketCenter?: number;
}) {
  const campaignId = useEu5PlaythroughId();
  const mapHistory = useMapHistory();
  const selected = useCurrentHistorySnapshot();
  const snapshots = useHistory((state) => state.snapshots);
  const busy = useHistory((state) => state.progress !== null);
  const [country, setCountry] = useState<number>();
  const [good, setGood] = useState("");
  const [markets, setMarkets] = useState<number[]>([]);
  const [metric, setMetric] = useState<MarketMetric>("price");
  const [showCombinedPrice, setShowCombinedPrice] = useState(false);
  const [indexed, setIndexed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const marketMode = mode === "markets";

  const catalog = useCampaignQuery(campaignId, catalogQuery, (campaignId, identity, sequence) =>
    eu5Analysis.query({ campaignId, identity, sequence, query: catalogQuery }),
  );
  const goods = catalog.result?.goods;
  const activeGood = marketMode
    ? goods?.includes(good)
      ? good
      : (goods?.find((value) => value === "wheat" || value === "grain") ?? goods?.[0])
    : undefined;
  const countries = useMemo(
    () => [...(catalog.result?.countryNames ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [catalog.result],
  );
  const selectedCountry = countries.find((item) => item.countryId === country);
  const countryId = !marketMode ? (focusCountryId ?? selectedCountry?.countryId) : undefined;
  const countryName = focusName ?? countries.find((item) => item.countryId === countryId)?.name;
  const restrictToCountry =
    marketMode && focusCountryId !== undefined && focusMarketCenter === undefined;
  const centerQuery = useCampaignQuery(
    campaignId,
    { kind: "countryMarketCenters", countryId: focusCountryId },
    (campaignId, identity, sequence) =>
      eu5Analysis.query({
        campaignId,
        identity,
        sequence,
        query: { kind: "countryMarketCenters", countryId: focusCountryId ?? 0 },
      }),
    restrictToCountry,
  );
  const marketChoices = useMemo(
    () =>
      (catalog.result?.marketLabels ?? [])
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
  const { dates, error, loading } = useHistoryObservations(
    campaignId,
    { countryId, good: activeGood, centers: activeMarkets.map((market) => market.center) },
    !marketMode || (!!activeGood && activeMarkets.length > 0),
  );

  const exportObservations = async () => {
    if (!campaignId) return;
    const generation = eu5Analysis.generation();
    const selectedSaves = snapshots.filter((snapshot) => snapshot.campaignId === campaignId);
    setExportError(null);
    setExporting(true);
    try {
      const parts: BlobPart[] = ['{"snapshots":['];
      for (const [sequence, snapshot] of selectedSaves.entries()) {
        const reply = await eu5Analysis.query({
          campaignId,
          selection: { kind: "ids", ids: [snapshot.id] },
          identity: snapshot.id,
          sequence,
          query: { kind: "analyticsObservation", id: snapshot.id },
        });
        if (
          generation !== eu5Analysis.generation() ||
          reply.outcome.status !== "ok" ||
          !reply.outcome.value
        )
          throw Error("Campaign analysis changed during export. Try again.");
        if (sequence) parts.push(",");
        parts.push(
          new Blob([
            JSON.stringify({
              ...reply.outcome.value,
              campaignId,
              contentHash: snapshot.contentHash,
            }),
          ]),
        );
      }
      parts.push("]}");
      downloadData(new Blob(parts, { type: "application/json" }), "eu5-snapshots.json");
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(false);
    }
  };

  const marketObservations = useMemo(
    () =>
      activeMarkets.map(({ name, center }) => ({
        name,
        observations: dates.map((date) =>
          activeGood === undefined ? undefined : marketObservation(date, center, activeGood),
        ),
      })),
    [activeMarkets, activeGood, dates],
  );
  const marketCharts = useMemo(() => {
    const lines = (key: MarketMetric) =>
      marketObservations.map(({ name, observations }) => ({
        name,
        raw: observations.map((observation) => observation?.[key]),
      }));
    return {
      price: lines("price"),
      supply: lines("supply"),
      demand: lines("demand"),
      stockpile: lines("stockpile"),
    };
  }, [marketObservations]);
  const canCombinePrice = metric === "price" && activeMarkets.length > 1;
  const primaryLines = useMemo(() => {
    if (!canCombinePrice || !showCombinedPrice) return marketCharts[metric];
    return [
      ...marketCharts.price,
      {
        name: "Combined price (volume weighted)",
        dashed: true,
        raw: dates.map((_, index) =>
          weightedMarketPrice(marketObservations.map(({ observations }) => observations[index])),
        ),
      },
    ];
  }, [canCombinePrice, dates, marketCharts, marketObservations, metric, showCombinedPrice]);
  const errorMessage = catalog.error ?? centerQuery.error ?? error;

  return (
    <section
      className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4"
      aria-label="Campaign history"
    >
      <div>
        <h2 className="text-sm font-semibold text-game-ink-100">
          {focusName ? `${focusName} · ` : ""}
          {labelFor(mode)} over time
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
                  onValueChange={(value: MarketMetric) => setMetric(value)}
                >
                  <GameSelect.Trigger aria-label="Metric">
                    <GameSelect.Value />
                  </GameSelect.Trigger>
                  <GameSelect.Content>
                    {marketMetricKeys.map((key) => (
                      <GameSelect.Item key={key} value={key}>
                        {marketMetrics[key]}
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
                    onChange={(event) => setShowCombinedPrice(event.target.checked)}
                  />
                  Show combined price weighted by trade volume
                </label>
              )}
              <label className="col-span-2 flex items-center gap-2 text-xs text-game-ink-300">
                <input
                  type="checkbox"
                  checked={indexed}
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
      ) : catalog.loading || centerQuery.loading || loading ? (
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
                title={`${labelFor(activeGood)} · ${marketMetrics[metric]}`}
                unit={metric === "price" ? "Saved price" : "Saved market units"}
                dates={dates}
                lines={primaryLines}
                selectedId={selected?.id}
                good={activeGood}
                metric={metric}
                indexed={indexed}
              />
              {(["supply", "demand", "stockpile"] as const)
                .filter((key) => key !== metric)
                .map((key) => (
                  <HistoryChart
                    key={key}
                    title={`${labelFor(activeGood)} · ${marketMetrics[key]}`}
                    unit="Saved market units"
                    dates={dates}
                    lines={marketCharts[key]}
                    selectedId={selected?.id}
                    good={activeGood}
                    metric={key}
                  />
                ))}
            </>
          ) : (
            <ContextGraphs
              dates={dates}
              mode={mode}
              countryId={countryId}
              countryName={countryName}
              selectedId={selected?.id}
            />
          )}
        </>
      )}
      {exportError && (
        <p role="alert" className="text-xs">
          {exportError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <GameButton
          disabled={exporting || !campaignId || !snapshots.length}
          onClick={() => void exportObservations()}
        >
          {exporting ? "Exporting…" : "Export observations JSON"}
        </GameButton>
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
