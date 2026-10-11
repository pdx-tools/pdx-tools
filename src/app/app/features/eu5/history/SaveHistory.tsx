import { exportSnapshots } from "./exportSnapshots";
import { ContextGraphs } from "./ContextGraphs";
import { useEffect, useMemo, useState } from "react";
import { analyzeCampaign } from "./analyzeCampaign";
import { useCampaign } from "@/features/campaign/CampaignProvider";
import {
  holdsRef,
  registerLocalSaves,
  sameFileVersion,
  useLocalSaves,
} from "@/features/campaign/localSaves";
import { useEu5Trigger } from "../features/profiles/useEu5Trigger";
import { GameThemeProvider } from "@/components/GameThemeProvider";
import { HistoryPlot } from "./HistoryPlot";
import type { EChartsOption } from "@/components/viz";
import { chartTooltip, getEChartsTheme, seriesColors } from "@/components/viz/echartsTheme";
import type { MapMode } from "@/wasm/wasm_eu5";
import { cachedSnapshots, clearSnapshotCache } from "@/features/eu5/history/cache";
import { useHistory } from "@/features/eu5/history/store";
import { campaignKey } from "@/features/eu5/history/types";
import styles from "@/features/eu5/history/Timeline.module.css";
import { useEu5Input, useEu5PlaythroughId, useEu5SaveDate, useEu5SaveInput } from "../store";
import { ImportProgress } from "./ImportProgress";

const EMPTY_NAMES: Record<string, string> = {};

type Metric = "price" | "supply" | "demand" | "stockpile" | "population" | "development";
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
  const campaign = useCampaign();
  const localSaves = useLocalSaves();
  const input = useEu5Input();
  const parsedInput = useEu5SaveInput();
  const playthroughId = useEu5PlaythroughId();
  const saveDate = useEu5SaveDate();
  const { data: context } = useEu5Trigger((engine) => engine.trigger.getHistoryContext(), []);
  const countryNames = context?.countryNames ?? EMPTY_NAMES;
  const version = context?.version;
  const entries = localSaves.filter(
    (entry) =>
      entry.game === "eu5" &&
      (entry.identity === null ||
        entry.identity.playthroughId === playthroughId ||
        (input.kind !== "server" && holdsRef(entry, input))),
  );
  const activeEntry = localSaves.find((entry) => input.kind !== "server" && holdsRef(entry, input));
  const association = activeEntry && history.sources[activeEntry.id];
  const dateSort = saveDate.year * 10000 + saveDate.month * 100 + saveDate.day;
  const currentSnapshot = history.snapshots.find(
    (snapshot) =>
      snapshot.campaignId === playthroughId &&
      snapshot.version === version &&
      snapshot.dateSort === dateSort &&
      (input.kind === "server" ||
        (association?.hash === snapshot.hash &&
          parsedInput.kind === "file" &&
          sameFileVersion(parsedInput.file, association.version))),
  );
  const selectedHash = currentSnapshot?.hash;
  const defaultGroup = currentSnapshot ? campaignKey(currentSnapshot) : "";
  const [group, setGroup] = useState(defaultGroup);
  const [previousHash, setPreviousHash] = useState(selectedHash);
  if (previousHash !== selectedHash) {
    setPreviousHash(selectedHash);
    setGroup(defaultGroup);
  }
  const defaultMetric = mapMode === "population" || mapMode === "development" ? mapMode : "price";
  const [metricState, setMetricState] = useState<{ mode: MapMode; value: Metric }>({
    mode: mapMode,
    value: defaultMetric,
  });
  const metric = metricState.mode === mapMode ? metricState.value : defaultMetric;
  if (metricState.mode !== mapMode) setMetricState({ mode: mapMode, value: defaultMetric });
  const setMetric = (value: Metric) => setMetricState({ mode: mapMode, value });
  const [good, setGood] = useState("");
  const [markets, setMarkets] = useState<string[]>([]);
  const [country, setCountry] = useState("world");
  const [indexed, setIndexed] = useState(false);
  const busy = history.progress !== null;
  const progress = history.progress;
  const issues = history.issues;
  useEffect(() => {
    if (useHistory.getState().snapshots.length) return;
    void cachedSnapshots()
      .then((snapshots) => useHistory.getState().add(snapshots))
      .catch(() => {});
  }, []);

  const groups = useMemo(
    () => [
      ...new Set(
        history.snapshots
          .filter((snapshot) => snapshot.campaignId === playthroughId)
          .map(campaignKey),
      ),
    ],
    [history.snapshots, playthroughId],
  );
  const preferredGroup = `${playthroughId}:${version}`;
  const activeGroup = groups.includes(group)
    ? group
    : groups.includes(preferredGroup)
      ? preferredGroup
      : groups[0];
  const dates = useMemo(
    () => history.snapshots.filter((s) => campaignKey(s) === activeGroup),
    [history.snapshots, activeGroup],
  );
  const isMarket = mapMode === "markets";
  const goods = useMemo(
    () => (isMarket ? [...new Set(dates.flatMap((s) => s.markets.map((m) => m.good)))].sort() : []),
    [dates, isMarket],
  );
  const activeGood = goods.includes(good)
    ? good
    : (goods.find((g) => g === "wheat" || g === "grain") ?? goods[0]);
  const labels = useMemo(() => {
    const result: Record<string, string> = {};
    if (!isMarket) return result;
    for (const snapshot of dates) {
      // A market has one label, shared by all of its goods.
      for (const [center, name] of Object.entries(snapshot.marketLabels)) {
        result[center] = name ? human(name) : `Location ${center}`;
      }
      for (const market of snapshot.markets) {
        result[market.center] ??= `Location ${market.center}`;
      }
    }
    return result;
  }, [dates, isMarket]);
  const { marketIds, activeMarkets } = useMemo(() => {
    const focusCenters = focusTag
      ? new Set(
          dates
            .flatMap((s) => s.countries.find((c) => c.tag === focusTag)?.marketCenters ?? [])
            .map(String),
        )
      : null;
    const marketIds = Object.keys(labels)
      .filter((id) =>
        focusMarketCenter != null
          ? id === String(focusMarketCenter)
          : focusCenters
            ? focusCenters.has(id)
            : true,
      )
      .sort((a, b) => labels[a].localeCompare(labels[b]));
    const chosenMarkets = markets.filter((m) => marketIds.includes(m));
    const activeMarkets = chosenMarkets.length
      ? chosenMarkets
      : marketIds.length
        ? [marketIds.find((id) => labels[id].toLowerCase() === "london") ?? marketIds[0]]
        : [];
    return { marketIds, activeMarkets };
  }, [dates, focusTag, focusMarketCenter, labels, markets]);
  const countries = useMemo(
    () =>
      [...new Set(dates.flatMap((s) => s.countries.map((c) => c.tag)))].sort((a, b) =>
        (countryNames[a] ?? a).localeCompare(countryNames[b] ?? b),
      ),
    [dates, countryNames],
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
              s.markets.find((m) => String(m.center) === entity && m.good === activeGood)?.[
                metric as "price" | "supply" | "demand" | "stockpile"
              ] ?? null
            );
          if (entity === "world") return s[metric as "population" | "development"];
          return (
            s.countries.find((c) => c.tag === entity)?.[metric as "population" | "development"] ??
            null
          );
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
        const baseline = s.raw.find((v) => v != null && Number.isFinite(v));
        const line = {
          id: `history/${metric}/${s.name}`,
          color: seriesColors[slot],
          name: s.name,
          type: "line" as const,
          smooth: false,
          connectNulls: false,
          symbolSize: 7,
          showSymbol: true,
          data: s.raw.map((v, i) => [
            Date.parse(`${dates[i].date}T00:00:00Z`),
            v == null || !Number.isFinite(v)
              ? null
              : indexed
                ? baseline != null && baseline > 0
                  ? (v / baseline) * 100
                  : null
                : v,
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

  const addFiles = async (list: FileList | null) => {
    if (!list || busy) return;
    const files = Array.from(list).filter((file) => /\.eu5$/i.test(file.name));
    if (!files.length) {
      useHistory.setState({ issues: ["No EU5 saves were found in the selection."] });
      return;
    }
    try {
      useHistory.setState({ analysisPaused: false });
      await registerLocalSaves(
        "eu5",
        files.map((file) => ({ kind: "file", file })),
      );
    } catch (error) {
      useHistory.setState({ issues: [String(error)] });
    }
  };

  const csv = () => {
    const quote = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const rows = [
      [
        "date",
        "campaign",
        "game_version",
        "entity",
        "good",
        "metric",
        "value",
        "save_content_hash",
      ],
    ];
    dates.forEach((s, i) =>
      series.forEach((line) =>
        rows.push([
          s.date,
          s.campaignId,
          s.version,
          line.name,
          isMarket ? activeGood : "",
          metric,
          line.raw[i] == null ? "" : String(line.raw[i]),
          s.hash,
        ]),
      ),
    );
    download(
      "eu5-observations.csv",
      rows.map((row) => row.map(quote).join(",")).join("\n"),
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
              Analyze local saves to compare dates across map views.
            </p>
          </div>
          <button
            className={styles.import}
            disabled={busy || !entries.length || !playthroughId}
            onClick={() => {
              void analyzeCampaign(entries, playthroughId).catch((error) =>
                useHistory.setState({ issues: [String(error)] }),
              );
            }}
          >
            {busy ? "Analyzing saves…" : `Analyze ${entries.length} local saves`}
          </button>
          <label className={styles.import}>
            Add EU5 saves
            <input
              aria-label="Add EU5 saves"
              type="file"
              accept=".eu5"
              multiple
              disabled={busy}
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <label className={styles.import}>
            Add save folder
            <input
              aria-label="Add EU5 save folder"
              type="file"
              multiple
              {...{ webkitdirectory: "" }}
              disabled={busy}
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </header>
        {progress && (
          <div className={styles.notice}>
            <ImportProgress progress={progress} onCancel={() => history.cancel?.()} />
          </div>
        )}
        {issues.length > 0 && (
          <details open className={styles.notice}>
            <summary>{issues.length} import notices</summary>
            <ul>
              {issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </details>
        )}
        {!dates.length ? (
          <section className={styles.empty}>
            <h2>Start with two or more saves</h2>
            <p>
              Add saves through the campaign navigation or select them here, then choose Analyze.
              Navigation remains available while observations are extracted in background workers.
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
              <label>
                Campaign / game version
                <select
                  value={activeGroup}
                  onChange={(e) => {
                    setGroup(e.target.value);
                    setMarkets([]);
                  }}
                >
                  {groups.map((g) => (
                    <option key={g} value={g}>
                      {g.split(":")[0].slice(0, 12)} · {g.split(":").at(-1)} ·{" "}
                      {history.snapshots.filter((s) => campaignKey(s) === g).length} dates
                    </option>
                  ))}
                </select>
              </label>
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
                  : "Metrics follow this section and the selected nation. Countries are matched by tag; absent countries remain gaps."}
              </p>
            </aside>
            <section className={styles.main}>
              {isMarket && (
                <div className={styles.chart}>
                  <div className={styles.chartHeading}>
                    <div>
                      <span className={styles.eyebrow}>
                        {dates.length} SAVED DATES
                        {currentSnapshot && campaignKey(currentSnapshot) === activeGroup
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
                        currentSnapshot && campaignKey(currentSnapshot) === activeGroup
                          ? currentSnapshot.date
                          : undefined
                      }
                      values={series.map((s) => {
                        const value =
                          s.raw[dates.findIndex((d) => d.hash === currentSnapshot?.hash)];
                        const baseline = s.raw.find((v) => v != null && Number.isFinite(v));
                        return value == null
                          ? null
                          : indexed
                            ? baseline != null && baseline > 0
                              ? (value / baseline) * 100
                              : null
                            : value;
                      })}
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
          <span>
            {history.snapshots.length} observations cached · Campaigns and game versions remain
            separate
          </span>
          <div>
            <button
              disabled={!dates.length}
              onClick={() =>
                download("eu5-snapshots.json", exportSnapshots(dates), "application/json")
              }
            >
              Export observations JSON
            </button>
            <button
              disabled={busy || !history.snapshots.length}
              onClick={() => {
                void clearSnapshotCache()
                  .then(() => history.clear())
                  .catch((e) => useHistory.setState({ issues: [String(e)] }));
              }}
            >
              Clear cached observations
            </button>
          </div>
        </footer>
      </main>
    </GameThemeProvider>
  );
}
