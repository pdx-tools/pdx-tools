import { campaignAnalysis } from "./analysisClient";
import { useCountryMarketCenters, useAnalysisHistory } from "./useAnalysisHistory";
import type { AnalysisDescriptor } from "./analysisTypes";
import { countryObservation, marketObservation } from "./observations";
import { exportHistoryCsv, historySeriesValues } from "./exportHistoryCsv";
import { ContextGraphs } from "./ContextGraphs";
import { useEffect, useMemo, useState } from "react";
import { useCampaign } from "@/features/campaign/CampaignProvider";
import { useEu5Trigger } from "../features/profiles/useEu5Trigger";
import { GameThemeProvider } from "@/components/GameThemeProvider";
import { HistoryPlot } from "./HistoryPlot";
import type { EChartsOption } from "@/components/viz";
import { chartTooltip, getEChartsTheme, seriesColors } from "@/components/viz/echartsTheme";
import type { MapMode } from "@/wasm/wasm_eu5";
import { useHistory } from "@/features/eu5/history/store";
import { useMapHistory } from "./MapHistory";
import styles from "@/features/eu5/history/Timeline.module.css";
import { useEu5PlaythroughId } from "../store";
import { useCurrentHistorySnapshot } from "./currentSnapshot";

type Metric = "price" | "supply" | "demand" | "stockpile" | "population" | "development";
type HistoryPreferences = {
  metricState: { mode: MapMode; value: Metric };
  good: string;
  markets: string[];
  country: string;
  indexed: boolean;
};
const preferences = new Map<string, HistoryPreferences>();
const metricNames: Record<Metric, string> = {
  price: "Price",
  supply: "Supply",
  demand: "Demand",
  stockpile: "Stockpile",
  population: "Population",
  development: "Development",
};

const human = (text: string) =>
  text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

function download(name: string, data: string | Blob, type: string) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SaveHistory({
  visible = true,
  mapMode = "markets",
  focusTag,
  focusName,
  focusMarketCenter,
}: {
  visible?: boolean;
  mapMode?: MapMode;
  focusTag?: string;
  focusName?: string;
  focusMarketCenter?: number;
}) {
  const history = useHistory();
  const mapHistory = useMapHistory();
  const campaign = useCampaign();
  const playthroughId = useEu5PlaythroughId();
  const { data: version } = useEu5Trigger((engine) => engine.queries.getSaveVersion(), []);
  const currentSnapshot = useCurrentHistorySnapshot(version);
  const defaultMetric = mapMode === "population" || mapMode === "development" ? mapMode : "price";
  const [metricState, setMetricState] = useState<{ mode: MapMode; value: Metric }>({
    ...(preferences.get(playthroughId ?? "")?.metricState ?? {
      mode: mapMode,
      value: defaultMetric,
    }),
  });
  const metric = metricState.mode === mapMode ? metricState.value : defaultMetric;
  if (metricState.mode !== mapMode) setMetricState({ mode: mapMode, value: defaultMetric });
  const setMetric = (value: Metric) => setMetricState({ mode: mapMode, value });
  const [good, setGood] = useState(() => preferences.get(playthroughId ?? "")?.good ?? "");
  const [markets, setMarkets] = useState<string[]>(
    () => preferences.get(playthroughId ?? "")?.markets ?? [],
  );
  const [country, setCountry] = useState(
    () => preferences.get(playthroughId ?? "")?.country ?? "world",
  );
  const [indexed, setIndexed] = useState(
    () => preferences.get(playthroughId ?? "")?.indexed ?? false,
  );
  useEffect(
    () => () => {
      preferences.set(playthroughId ?? "", { metricState, good, markets, country, indexed });
    },
    [playthroughId, metricState, good, markets, country, indexed],
  );
  const busy = history.progress !== null;
  const metadata = useMemo(
    () =>
      history.snapshots.filter((row) => row.campaignId === playthroughId) as AnalysisDescriptor[],
    [history.snapshots, playthroughId],
  );
  const isMarket = mapMode === "markets";
  const goods = useMemo(
    () => [...new Set(metadata.flatMap((row) => row.goods ?? []))].sort(),
    [metadata],
  );
  const countryNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const row of metadata)
      for (const [id, name] of Object.entries(row.countryNames ?? {})) names[`id:${id}`] = name;
    return names;
  }, [metadata]);
  const activeGood = goods.includes(good)
    ? good
    : (goods.find((g) => g === "wheat" || g === "grain") ?? goods[0]);
  const labels = useMemo(() => {
    const result: Record<string, string> = {};
    for (const row of metadata)
      for (const [center, name] of Object.entries(row.marketLabels)) result[center] = human(name);
    return result;
  }, [metadata]);
  const focusCenters = useCountryMarketCenters(playthroughId ?? "", focusTag, visible);
  const { marketIds, activeMarkets } = useMemo(() => {
    const marketIds = Object.keys(labels)
      .filter((id) =>
        focusMarketCenter != null
          ? id === String(focusMarketCenter)
          : focusCenters === null || focusCenters.includes(Number(id)),
      )
      .sort((a, b) => labels[a].localeCompare(labels[b]));
    const chosenMarkets = markets.filter((m) => marketIds.includes(m));
    const activeMarkets = chosenMarkets.length
      ? chosenMarkets
      : marketIds.length
        ? [marketIds.find((id) => labels[id].toLowerCase() === "london") ?? marketIds[0]]
        : [];
    return { marketIds, activeMarkets };
  }, [focusMarketCenter, focusCenters, labels, markets]);
  const countries = useMemo(
    () =>
      Object.keys(countryNames).sort((a, b) =>
        (countryNames[a] ?? a).localeCompare(countryNames[b] ?? b),
      ),
    [countryNames],
  );
  const countryOptions = useMemo(
    () =>
      countries.map((c) => (
        <option key={c} value={c}>
          {countryNames[c] ?? c}
        </option>
      )),
    [countries, countryNames],
  );
  const activeCountry = focusTag ?? (countries.includes(country) ? country : "world");
  const { dates, loading, error } = useAnalysisHistory(
    {
      campaignId: playthroughId ?? "",
      country: activeCountry,
      good: isMarket ? activeGood : undefined,
      centers: activeMarkets.map(Number),
    },
    visible,
  );
  const entities = useMemo(
    () => (isMarket ? activeMarkets : [activeCountry]),
    [isMarket, activeMarkets, activeCountry],
  );
  const series = useMemo(
    () =>
      entities.map((entity) => ({
        name: isMarket
          ? labels[entity]
          : entity === "world"
            ? "World · owned locations"
            : (countryNames[entity] ?? entity),
        raw: dates.map((s) => {
          if (isMarket)
            return (
              marketObservation(s, Number(entity), activeGood)?.[
                metric as "price" | "supply" | "demand" | "stockpile"
              ] ?? null
            );
          if (entity === "world") return s[metric as "population" | "development"];
          return countryObservation(s, entity)?.[metric as "population" | "development"] ?? null;
        }),
      })),
    [dates, entities, isMarket, activeGood, metric, countryNames, labels],
  );
  const indexUnavailable =
    indexed &&
    series.some((s) => {
      const v = s.raw.find((x) => x != null && Number.isFinite(x));
      return v == null || v <= 0;
    });
  const theme = getEChartsTheme();
  const option = useMemo(
    (): EChartsOption => ({
      useUTC: true,
      animation: false,
      animationDuration: 250,
      animationDurationUpdate: 750,
      animationEasingUpdate: "cubicInOut",
      color: [...seriesColors],
      textStyle: { fontFamily: theme.numFamily, color: theme.labelColor },
      tooltip: { ...chartTooltip, trigger: "axis", confine: true },
      legend: {
        top: 8,
        type: "scroll",
        textStyle: { color: theme.labelColor },
        pageTextStyle: { color: theme.labelColor },
      },
      grid: { left: 78, right: 25, top: 55, bottom: 85 },
      xAxis: {
        type: "time",
        axisLabel: { formatter: "{yyyy}-{MM}", color: theme.tickColor, hideOverlap: true },
        axisLine: { lineStyle: { color: theme.axisColor } },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: { color: theme.tickColor },
        nameTextStyle: { color: theme.labelColor },
        name: indexed
          ? "First observation = 100"
          : metric === "population"
            ? "People"
            : metric === "price"
              ? "Saved price"
              : "Save units",
        splitLine: { lineStyle: { color: theme.gridLineColor } },
      },
      dataZoom: [
        { type: "inside" },
        {
          type: "slider",
          height: 22,
          bottom: 20,
          textStyle: { color: theme.tickColor },
          borderColor: theme.axisColor,
        },
      ],
      series: series.map((s, slot) => {
        const line = {
          id: `history/${metric}/${s.name}`,
          color: seriesColors[slot],
          name: s.name,
          type: "line" as const,
          smooth: false,
          connectNulls: false,
          symbolSize: 7,
          showSymbol: true,
          data: historySeriesValues(s.raw, indexed).map((value, i) => [
            Date.parse(`${dates[i].date}T00:00:00Z`),
            value,
          ]),
        };
        return line;
      }),
    }),
    [
      dates,
      series,
      indexed,
      metric,
      theme.labelColor,
      theme.tickColor,
      theme.numFamily,
      theme.axisColor,
      theme.gridLineColor,
    ],
  );

  const csv = () => {
    download(
      "eu5-observations.csv",
      exportHistoryCsv(dates, series, {
        metric,
        good: isMarket ? activeGood : "",
        indexed,
      }),
      "text/csv;charset=utf-8",
    );
  };

  return (
    <GameThemeProvider theme="eu5">
      <main className={styles.page}>
        <header className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>CAMPAIGN HISTORY</span>
            <h1>
              {focusName ? `${focusName} · ` : ""}
              {human(mapMode)} over time
            </h1>
            <p>
              {campaign ? `${campaign.saves.length} campaign saves available for navigation. ` : ""}
              {mapHistory?.enabled
                ? "New saves are analyzed automatically unless analysis is paused."
                : "Choose Analyze campaign in the left sidebar to start analysis."}
            </p>
          </div>
        </header>
        {error ? (
          <p>{error}</p>
        ) : loading ? (
          <p>Loading campaign charts…</p>
        ) : !dates.length ? (
          <section className={styles.empty}>
            <h2>Start with two or more saves</h2>
            <p>
              Add saves using the left sidebar, then choose Analyze campaign. Navigation remains
              available while observations are extracted in background workers.
            </p>
            <p>
              Every section has its own history: development, control, wealth, taxation, population,
              births, buildings, religion, RGO capacity and markets.
            </p>
          </section>
        ) : (
          <div className={styles.layout}>
            <aside className={styles.panel}>
              <h2>History filters</h2>
              {isMarket && (
                <label>
                  Metric
                  <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
                    {Object.entries(metricNames)
                      .filter(([v]) => ["price", "supply", "demand", "stockpile"].includes(v))
                      .map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {isMarket ? (
                <>
                  <label>
                    Good
                    <select value={activeGood} onChange={(e) => setGood(e.target.value)}>
                      {goods.map((g) => (
                        <option key={g} value={g}>
                          {human(g)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Markets · choose up to six
                    <select
                      aria-label="Markets"
                      multiple
                      size={8}
                      value={activeMarkets}
                      onChange={(e) =>
                        setMarkets(
                          Array.from(e.target.selectedOptions)
                            .map((o) => o.value)
                            .slice(0, 6),
                        )
                      }
                    >
                      {marketIds.map((id) => (
                        <option key={id} value={id}>
                          {labels[id]}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : !focusTag ? (
                <label>
                  Country
                  <select value={activeCountry} onChange={(e) => setCountry(e.target.value)}>
                    <option value="world">World · owned locations</option>
                    {countryOptions}
                  </select>
                </label>
              ) : (
                <p className={styles.help}>Following selected nation: {focusName ?? focusTag}</p>
              )}
              {isMarket && (
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={indexed}
                    onChange={(e) => setIndexed(e.target.checked)}
                  />{" "}
                  Index first observation to 100
                </label>
              )}
              <p className={styles.help}>
                {isMarket
                  ? "Markets are matched by center location, not reusable market IDs. A relocated market becomes a separate series."
                  : "Metrics follow this section and the selected nation. Countries are matched by stable ID; absent countries remain gaps."}
              </p>
            </aside>
            <section className={styles.main}>
              {isMarket && (
                <div className={styles.chart}>
                  <div className={styles.chartHeading}>
                    <div>
                      <span className={styles.eyebrow}>
                        {dates.length} SAVED DATES
                        {currentSnapshot && currentSnapshot.campaignId === playthroughId
                          ? ` · ${currentSnapshot.date}`
                          : ""}
                      </span>
                      <h2>
                        {isMarket ? `${human(activeGood ?? "Good")} · ` : ""}
                        {metricNames[metric]}
                      </h2>
                    </div>
                    <button onClick={csv}>Export CSV</button>
                  </div>
                  {indexUnavailable && (
                    <p className={styles.notice}>
                      Indexing requires a positive first observation. Series starting at zero or
                      without data are omitted.
                    </p>
                  )}
                  {visible ? (
                    <HistoryPlot
                      option={option}
                      date={
                        currentSnapshot && currentSnapshot.campaignId === playthroughId
                          ? currentSnapshot.date
                          : undefined
                      }
                      values={series.map(
                        (s) =>
                          historySeriesValues(s.raw, indexed)[
                            dates.findIndex((date) => date.hash === currentSnapshot?.hash)
                          ] ?? null,
                      )}
                      height={300}
                      top={55}
                      bottom={85}
                      left={78}
                      right={25}
                    />
                  ) : null}
                  <p className={styles.help}>
                    Points are actual saved observations. Lines connect them; missing market/good
                    records remain gaps. The moving markers follow the map date; animation between
                    points is visual only.
                  </p>
                </div>
              )}
              {visible && (
                <ContextGraphs
                  dates={dates}
                  mode={mapMode}
                  country={activeCountry}
                  countryName={focusName ?? countryNames[activeCountry]}
                  selectedHash={currentSnapshot?.hash}
                  good={activeGood}
                  centers={activeMarkets}
                />
              )}
            </section>
          </div>
        )}
        <footer className={styles.footer}>
          <span>{history.snapshots.length} observations in memory · Campaigns remain separate</span>
          <div>
            <button
              disabled={!dates.length}
              onClick={() =>
                void campaignAnalysis()
                  .exportObservations(playthroughId ?? "")
                  .then((blob) => download("eu5-snapshots.json", blob, "application/json"))
              }
            >
              Export observations JSON
            </button>
            <button
              disabled={
                busy ||
                !playthroughId ||
                !history.snapshots.length ||
                !mapHistory ||
                mapHistory.inspecting
              }
              onClick={() => {
                void mapHistory?.clearCampaign();
              }}
            >
              Clear campaign analysis
            </button>
          </div>
        </footer>
      </main>
    </GameThemeProvider>
  );
}
