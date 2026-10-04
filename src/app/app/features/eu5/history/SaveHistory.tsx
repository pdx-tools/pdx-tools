import { ContextGraphs } from "./ContextGraphs";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { wrap } from "comlink";
import { GameThemeProvider } from "@/components/GameThemeProvider";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import {
  chartTooltip,
  getEChartsTheme,
  seriesColors,
  selectionColor,
} from "@/components/viz/echartsTheme";
import type { MapMode } from "@/wasm/wasm_eu5";
import { useSaveFileInput } from "@/features/engine/engineStore";
import { useEngineActions } from "@/features/engine/engineStore";
import { cachedSnapshots, cacheSnapshot, clearSnapshotCache } from "@/features/eu5/history/cache";
import { useHistory } from "@/features/eu5/history/store";
import { campaignKey } from "@/features/eu5/history/types";
import type { Snapshot } from "@/features/eu5/history/types";
import type { parseSnapshot } from "@/features/eu5/history/snapshot-worker";
import styles from "@/features/eu5/history/Timeline.module.css";

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

function download(name: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SaveHistory({
  embedded = false,
  visible = true,
  mapMode = "markets",
  currentFile,
  onChoose,
  performancePanel,
  focusTag,
  focusName,
  focusMarketCenter,
}: {
  embedded?: boolean;
  visible?: boolean;
  mapMode?: MapMode;
  currentFile?: File;
  onChoose?: (hash: string) => Promise<void>;
  performancePanel?: ReactNode;
  focusTag?: string;
  focusName?: string;
  focusMarketCenter?: number;
}) {
  const history = useHistory();
  const input = useSaveFileInput();
  const navigate = useNavigate();
  const { fileInput } = useEngineActions();
  const currentSnapshot = history.snapshots.find((s) => s.hash === history.selectedHash);
  const [group, setGroup] = useState(currentSnapshot ? campaignKey(currentSnapshot) : "");
  const [metric, setMetric] = useState<Metric>(
    mapMode === "population" || mapMode === "development" ? mapMode : "price",
  );
  useEffect(() => {
    setMetric(mapMode === "population" || mapMode === "development" ? mapMode : "price");
  }, [mapMode]);
  const [good, setGood] = useState("");
  const [markets, setMarkets] = useState<string[]>([]);
  const [country, setCountry] = useState("world");
  const [indexed, setIndexed] = useState(false);
  const [dateIndex, setDateIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const workerRef = useRef<Worker | null>(null);
  const generation = useRef(0);
  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    let alive = true;
    void cachedSnapshots()
      .then((rows) => {
        if (alive) useHistory.getState().add(rows);
      })
      .catch((e) => {
        if (alive) setIssues([`Browser cache unavailable: ${String(e)}`]);
      });
    return () => {
      alive = false;
      generation.current++;
      cancelRef.current?.();
      workerRef.current?.terminate();
    };
  }, []);

  const groups = useMemo(
    () => [...new Set(history.snapshots.map(campaignKey))],
    [history.snapshots],
  );
  const activeGroup = groups.includes(group) ? group : groups[0];
  const dates = useMemo(
    () => history.snapshots.filter((s) => campaignKey(s) === activeGroup),
    [history.snapshots, activeGroup],
  );
  useEffect(() => {
    if (!currentSnapshot) return;
    setGroup(campaignKey(currentSnapshot));
    const campaignDates = history.snapshots.filter(
      (s) => campaignKey(s) === campaignKey(currentSnapshot),
    );
    setDateIndex(
      Math.max(
        0,
        campaignDates.findIndex((s) => s.hash === currentSnapshot.hash),
      ),
    );
  }, [currentSnapshot?.hash, history.snapshots]);
  const selected = dates[Math.min(dateIndex, Math.max(0, dates.length - 1))];
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
  const countries = useMemo(
    () => [...new Set(dates.flatMap((s) => s.countries.map((c) => c.tag)))].sort(),
    [dates],
  );
  const countryOptions = useMemo(
    () =>
      countries.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      )),
    [countries],
  );
  const activeCountry = focusTag ?? (countries.includes(country) ? country : "world");
  const entities = isMarket ? activeMarkets : [activeCountry];
  const seriesKey = entities.join("|");
  const series = useMemo(
    () =>
      entities.map((entity) => ({
        name: isMarket ? labels[entity] : entity === "world" ? "World · owned locations" : entity,
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
    [dates, seriesKey, isMarket, activeGood, metric],
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
      animation: true,
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
        axisLabel: { formatter: "{yyyy}-{MM}", color: theme.tickColor },
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
      series: series.flatMap((s, slot) => {
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
          markLine:
            currentSnapshot && campaignKey(currentSnapshot) === activeGroup
              ? {
                  silent: true,
                  symbol: "none" as const,
                  label: { show: false },
                  lineStyle: { color: selectionColor, type: "dashed" as const },
                  data: [{ xAxis: Date.parse(`${currentSnapshot.date}T00:00:00Z`) }],
                }
              : undefined,
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
        const currentIndex = dates.findIndex((d) => d.hash === currentSnapshot?.hash);
        const point = line.data[currentIndex];
        return [
          line,
          {
            id: `playhead/${metric}/${s.name}`,
            name: s.name,
            type: "scatter" as const,
            color: seriesColors[slot],
            symbolSize: 13,
            z: 10,
            itemStyle: { borderColor: theme.labelColor, borderWidth: 1.5 },
            data: point && point[1] != null ? [point] : [],
          },
        ];
      }),
    }),
    [dates, series, indexed, currentSnapshot?.hash, metric],
  );

  const importFiles = async (list: FileList | null) => {
    if (!list || busy) return;
    const files = Array.from(list);
    if (embedded && currentFile && !files.includes(currentFile)) files.unshift(currentFile);
    if (files.length > 200) {
      setIssues(["Import at most 200 saves at a time."]);
      return;
    }
    setBusy(true);
    setIssues([]);
    const currentGeneration = ++generation.current;
    const worker = new Worker(new URL("./snapshot-worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    const parser = wrap<{ parseSnapshot: typeof parseSnapshot }>(worker);
    let cacheWarning = false;
    const cancelled = new Promise<never>((_, reject) => {
      cancelRef.current = () => reject(new Error("Import stopped"));
    });
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (currentGeneration !== generation.current) break;
        setProgress(`${i + 1}/${files.length} · ${file.name}`);
        try {
          if (!file.name.toLowerCase().endsWith(".eu5")) throw new Error("Not an EU5 save");
          const snapshot = await Promise.race([parser.parseSnapshot(file), cancelled]);
          if (currentGeneration !== generation.current) break;
          const conflict = useHistory
            .getState()
            .snapshots.find(
              (s) =>
                campaignKey(s) === campaignKey(snapshot) &&
                s.dateSort === snapshot.dateSort &&
                s.hash !== snapshot.hash,
            );
          if (conflict)
            throw new Error(
              `A different save already occupies ${snapshot.date}. Separate alternate campaign branches before importing.`,
            );
          const state = useHistory.getState();
          const activeFile =
            currentFile ??
            (input?.kind === "eu5" && input.data.kind === "file" ? input.data.file : null);
          const attachedFile =
            state.selectedHash === snapshot.hash && state.files[snapshot.hash] === activeFile
              ? activeFile
              : file;
          history.add([snapshot], { [snapshot.hash]: attachedFile ?? file });
          if (activeFile === file) {
            history.rememberMode(mapMode);
            history.rememberPanel(true);
            history.select(snapshot.hash);
          }
          try {
            await cacheSnapshot(snapshot);
          } catch {
            if (!cacheWarning) {
              cacheWarning = true;
              setIssues((old) => [
                ...old,
                "Browser cache could not be written; this session's charts still work.",
              ]);
            }
          }
        } catch (error) {
          if (currentGeneration === generation.current)
            setIssues((old) => [...old, `${file.name}: ${String(error)}`]);
        }
      }
    } finally {
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
      if (currentGeneration === generation.current) {
        cancelRef.current = null;
        setBusy(false);
        setProgress("");
      }
    }
  };

  const openMap = () => {
    if (!selected || !history.files[selected.hash]) return;
    if (embedded && onChoose) {
      void onChoose(selected.hash);
      return;
    }
    history.select(selected.hash);
    history.setTimelineSource("snapshots");
    if (embedded) {
      history.rememberMode(mapMode);
      history.rememberPanel(true);
    }
    fileInput({ kind: "eu5", data: { kind: "file", file: history.files[selected.hash] } });
    if (!embedded) navigate("/");
  };
  const csv = () => {
    const quote = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["date", "campaign", "game_version", "entity", "good", "metric", "value", "save_sha256"],
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
            <p>Add saves to compare dates across every map view.</p>
          </div>
          <label className={styles.import}>
            {busy ? "Parsing saves…" : "Add EU5 saves"}
            <input
              aria-label="Add EU5 saves"
              type="file"
              accept=".eu5"
              multiple
              disabled={busy}
              onChange={(e) => {
                void importFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </header>
        {busy && (
          <div role="status" className={styles.notice}>
            {progress}
            <button
              onClick={() => {
                generation.current++;
                cancelRef.current?.();
                workerRef.current?.terminate();
                workerRef.current = null;
                setBusy(false);
                setProgress("");
              }}
            >
              Stop import
            </button>
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
        {history.switchError ? (
          <div role="alert" className={styles.notice}>
            {history.switchError}
          </div>
        ) : null}
        {!dates.length ? (
          <section className={styles.empty}>
            <h2>Start with two or more saves</h2>
            <p>
              Select autosaves from the same campaign. Parsing runs locally in a worker; compact
              observations stay in your browser.
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
                    setDateIndex(0);
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
                    <EChart
                      mergeUpdates
                      option={option}
                      style={{ height: "300px", width: "100%" }}
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
                  selectedHash={currentSnapshot?.hash ?? selected?.hash}
                  good={activeGood}
                  centers={activeMarkets}
                />
              )}
              <div className={styles.snapshot}>
                <div>
                  <span className={styles.eyebrow}>INSPECT A SAVED MOMENT</span>
                  <h2>{selected?.date}</h2>
                  <p>{selected?.fileName}</p>
                </div>
                <button
                  onClick={openMap}
                  disabled={history.switching || !selected || !history.files[selected.hash]}
                >
                  View this date
                </button>
                <input
                  aria-label="Timeline saved date"
                  type="range"
                  min={0}
                  max={dates.length - 1}
                  value={Math.min(dateIndex, dates.length - 1)}
                  onChange={(e) => setDateIndex(Number(e.target.value))}
                />
                <p className={styles.help}>
                  The bottom timeline switches saves in every map mode. After a reload, reselect
                  original files to enable map switching; charts stay cached.
                </p>
              </div>
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
                download(
                  "eu5-snapshots.json",
                  JSON.stringify({ schemaVersion: 2, snapshots: dates }),
                  "application/json",
                )
              }
            >
              Export observations JSON
            </button>
            <button
              disabled={busy || !history.snapshots.length}
              onClick={() => {
                void clearSnapshotCache()
                  .then(() => history.clear())
                  .catch((e) => setIssues([String(e)]));
              }}
            >
              Clear cached observations
            </button>
          </div>
          {performancePanel}
        </footer>
      </main>
    </GameThemeProvider>
  );
}
