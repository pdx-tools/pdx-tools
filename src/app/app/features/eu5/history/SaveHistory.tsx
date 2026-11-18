import { useMemo, useState } from "react";
import { GameButton } from "@/components/game/Button";
import { focusRing } from "@/components/game/focusRing";
import { cx } from "class-variance-authority";
import { downloadData } from "@/lib/downloadData";
import type { MapMode } from "@/wasm/wasm_eu5";
import { useEu5PlaythroughId } from "../store";
import { ContextGraphs } from "./ContextGraphs";
import { HistoryChart } from "./HistoryChart";
import { eu5Analysis } from "./analysisClient";
import { useMapHistory } from "./context";
import { useCurrentHistorySnapshot } from "./currentSnapshot";
import { marketObservation } from "./observations";
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
const selectClass = cx(
  "mt-1 block w-full rounded-control border border-game-control-line bg-game-panel px-2 py-1.5 text-xs text-game-ink-100",
  focusRing,
);
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
  const countryId = !marketMode ? (focusCountryId ?? country) : undefined;
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
  const activeMarkets = useMemo(() => {
    const chosen = marketChoices.filter((market) => markets.includes(market.center));
    return chosen.length ? chosen : marketChoices.slice(0, 1);
  }, [marketChoices, markets]);
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

  const marketCharts = useMemo(() => {
    const lines = (key: MarketMetric) =>
      activeMarkets.map((market) => ({
        name: market.name,
        raw: dates.map((date) =>
          activeGood === undefined
            ? null
            : marketObservation(date, market.center, activeGood)?.[key],
        ),
      }));
    return {
      price: lines("price"),
      supply: lines("supply"),
      demand: lines("demand"),
      stockpile: lines("stockpile"),
    };
  }, [activeMarkets, activeGood, dates]);
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
              <label className="text-xs text-game-ink-300">
                Good
                <select
                  className={selectClass}
                  value={activeGood ?? ""}
                  onChange={(event) => setGood(event.target.value)}
                >
                  {goods?.map((key) => (
                    <option key={key} value={key}>
                      {labelFor(key)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-game-ink-300">
                Metric
                <select
                  className={selectClass}
                  value={metric}
                  onChange={(event) => setMetric(event.target.value as MarketMetric)}
                >
                  {marketMetricKeys.map((key) => (
                    <option key={key} value={key}>
                      {marketMetrics[key]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 text-xs text-game-ink-300">
                Markets (up to six)
                <select
                  multiple
                  size={5}
                  className={selectClass}
                  value={activeMarkets.map((market) => String(market.center))}
                  onChange={(event) =>
                    setMarkets(
                      Array.from(event.target.selectedOptions, (option) =>
                        Number(option.value),
                      ).slice(0, 6),
                    )
                  }
                >
                  {marketChoices.map(({ center, name }) => (
                    <option key={center} value={center}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
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
            <label className="text-xs text-game-ink-300">
              Country
              <select
                className={selectClass}
                value={country ?? ""}
                onChange={(event) =>
                  setCountry(event.target.value === "" ? undefined : Number(event.target.value))
                }
              >
                <option value="">World · owned locations</option>
                {countries.map(({ countryId, name }) => (
                  <option key={countryId} value={countryId}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
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
            ? "No market observations match this selection."
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
                lines={marketCharts[metric]}
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
