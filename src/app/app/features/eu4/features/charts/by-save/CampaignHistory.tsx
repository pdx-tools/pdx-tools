import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { useVisualizationDispatch } from "@/components/viz";
import { useAnalysisQuery } from "@/features/campaign/analysis/useAnalysisQuery";
import { useAddCampaignSaves } from "@/features/campaign/useAddCampaignSaves";
import type { CampaignSaveFiles } from "@/features/campaign/useAddCampaignSaves";
import { openCampaignSave } from "@/features/campaign/openSave";
import { MONTH_ABBR, dayNumber, formatLongDate } from "@/features/timeline/date";
import { MONTH_DAY_SIZERS } from "@/features/timeline/TimelineReadout";
import { cx } from "class-variance-authority";
import { eu4Analysis } from "@/features/eu4/analysis/analysisClient";
import { useEu4History } from "@/features/eu4/analysis/store";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";
import { useEu4Actions, useEu4Countries, useTagFilter } from "@/features/eu4/store";
import { getEu4Worker } from "@/features/eu4/worker/getEu4Worker";
import type { ChartCountries, CountryMetric } from "@/wasm/wasm_eu4";
import { BySaveChart } from "./BySaveChart";
import type { BySaveSeries } from "./BySaveChart";
import { BySaveTable, NotAtThisSave } from "./BySaveTable";
import { bySaveFigures } from "./figures";
import type { BySaveFigure, BySaveViz } from "./figures";
import { alignColumns, amount, bySaveCsv, lineageRows, rowsAt, sourceText } from "./model";
import type { BySaveData } from "./model";
import { useEu4Campaign } from "./useEu4Campaign";
import { selectSave, useBySaveView } from "./view";
import type { Eu4Campaign } from "./useEu4Campaign";

const EU4_SAVES: CampaignSaveFiles = {
  pattern: /\.eu4$/i,
  accept: ".eu4",
  picker: { description: "EU4 saves", accept: { "application/pdx": [".eu4"] } },
};

/** The most countries that a filter gives a chart. */
const COUNTRY_LIMIT = 20;

/** One value for each analyzed save of the campaign, as a chart and a table. */
export function CampaignHistory({ viz }: { viz: BySaveViz }) {
  const campaign = useEu4Campaign();
  const { saves, enabled } = campaign;
  if (saves.length < 2 && !enabled) return <OnlySave />;
  if (!enabled) return <NotAnalyzed campaign={campaign} />;
  const figure = bySaveFigures[viz];
  return figure.metric ? (
    <CountryFigure campaign={campaign} figure={figure} metric={figure.metric} />
  ) : (
    <WorldFigure campaign={campaign} figure={figure} />
  );
}

/** A figure without data has no CSV, not the CSV of the chart before it. */
function useNoCsv() {
  const visualizationDispatch = useVisualizationDispatch();
  useEffect(() => {
    visualizationDispatch({ type: "update-csv-data", getCsvData: async () => "" });
  }, [visualizationDispatch]);
}

function OnlySave() {
  useNoCsv();
  return (
    <div className="flex flex-col items-start gap-3">
      <p>This is the only save of this campaign here. Add more to compare them.</p>
      <AddSaves />
    </div>
  );
}

function NotAnalyzed({ campaign }: { campaign: Eu4Campaign }) {
  useNoCsv();
  return (
    <div className="flex flex-col items-start gap-3">
      <p>{countLine(campaign.saves)}</p>
      {campaign.nav?.truncated && <p>Shows the latest 200 uploads.</p>}
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={campaign.analyze}>
          Analyze campaign
        </Button>
        <span className="text-sm text-gray-600 dark:text-gray-300">
          Kept until you refresh this page.
        </span>
      </div>
      <AddSaves />
    </div>
  );
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "14 saves, 1444 Nov 11 to 1650 Mar 3: 6 local files, 8 uploads to download." */
function countLine(saves: readonly AnalysisSave[]) {
  const first = saves[0]?.date;
  const last = saves.at(-1)?.date;
  const range = first && last ? `, ${formatLongDate(first)} to ${formatLongDate(last)}` : "";
  const uploads = saves.filter((x) => x.save.source.kind === "upload").length;
  const local = saves.length - uploads;
  const parts = [
    local && plural(local, "local file", "local files"),
    uploads && plural(uploads, "upload to download", "uploads to download"),
  ].filter(Boolean);
  return `${plural(saves.length, "save", "saves")}${range}: ${parts.join(", ")}.`;
}

const WORLD_DEVELOPMENT = { kind: "worldDevelopment" } as const;

function WorldFigure({ campaign, figure }: { campaign: Eu4Campaign; figure: BySaveFigure }) {
  const { result, snapshotIds, error } = useAnalysisQuery(
    eu4Analysis,
    useEu4History,
    campaign.playthroughId,
    WORLD_DEVELOPMENT,
  );
  const data = useMemo((): BySaveData => {
    const { columns, at } = alignColumns(snapshotIds, campaign.saves);
    const values = result?.rows.map((row) => row.value ?? null) ?? [];
    return {
      columns,
      rows: [
        {
          key: "world",
          lineage: null,
          cells: at.map((i) => {
            const value = values[i];
            return value === null || value === undefined
              ? null
              : { kind: "value" as const, tag: "", value };
          }),
        },
      ],
    };
  }, [result, snapshotIds, campaign.saves]);
  return <BySaveView campaign={campaign} figure={figure} data={data} error={error} chart={null} />;
}

function CountryFigure({
  campaign,
  figure,
  metric,
}: {
  campaign: Eu4Campaign;
  figure: BySaveFigure;
  metric: CountryMetric;
}) {
  const chart = useChartCountries(campaign.playthroughId);
  const query = useMemo(
    () => (chart ? { kind: "countrySeries" as const, tags: chart.tags, metric } : null),
    [chart, metric],
  );
  const { result, snapshotIds, error } = useAnalysisQuery(
    eu4Analysis,
    useEu4History,
    campaign.playthroughId,
    query,
  );
  const data = useMemo((): BySaveData => {
    const { columns, at } = alignColumns(snapshotIds, campaign.saves);
    return { columns, rows: result ? lineageRows(result, at) : [] };
  }, [result, snapshotIds, campaign.saves]);
  return (
    <BySaveView
      campaign={campaign}
      figure={figure}
      data={data}
      error={error}
      chart={chart}
      loaded={!!result && data.columns.length > 0}
    />
  );
}

/** The countries of the filter, pinned so that opening another save keeps them. */
function useChartCountries(campaignId: string | null) {
  const filter = useTagFilter();
  const key = JSON.stringify(filter);
  const current = useBySaveView((state) =>
    state.pinned && state.pinned.campaignId === campaignId && state.pinned.filter === key
      ? state.pinned.countries
      : null,
  );
  useEffect(() => {
    if (current || !campaignId) return;
    let cancelled = false;
    void getEu4Worker()
      .eu4ChartCountries(filter, COUNTRY_LIMIT)
      .then((countries) => {
        if (!cancelled) useBySaveView.setState({ pinned: { campaignId, filter: key, countries } });
      });
    return () => {
      cancelled = true;
    };
  }, [current, campaignId, filter, key]);
  return current;
}

/** The column of the save nearest a day. */
function nearestColumn(columns: readonly AnalysisSave[], day: number) {
  let best = -1;
  let distance = Infinity;
  columns.forEach((column, i) => {
    const gap = Math.abs(dayNumber(column.date) - day);
    if (gap < distance) {
      distance = gap;
      best = i;
    }
  });
  return best;
}

function BySaveView({
  campaign,
  figure,
  data,
  error,
  chart,
  loaded = true,
}: {
  campaign: Eu4Campaign;
  figure: BySaveFigure;
  data: BySaveData;
  error: string | null;
  chart: ChartCountries | null;
  /** False while the values are still coming. */
  loaded?: boolean;
}) {
  const { nav, playthroughId } = campaign;
  const { columns, rows } = data;
  const countries = useEu4Countries();
  const names = useMemo(() => new Map(countries.map((x) => [x.tag, x])), [countries]);
  const series = useMemo(
    (): BySaveSeries[] =>
      rows.map((row) => ({
        key: row.key,
        points: row.cells.flatMap((cell, i) => {
          const value = amount(cell);
          if (value === null || !cell) return [];
          const color = cell.tag ? (names.get(cell.tag)?.color ?? "#808080") : "#64748b";
          return [{ day: dayNumber(columns[i].date), value, color }];
        }),
      })),
    [rows, columns, names],
  );
  const visualizationDispatch = useVisualizationDispatch();
  useEffect(() => {
    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: async () => bySaveCsv(data, figure, names),
    });
  }, [data, figure, names, visualizationDispatch]);

  // Only saves with values can be selected. The latest one is selected at first.
  const selectedKey = useBySaveView((state) =>
    state.selected?.campaignId === playthroughId ? state.selected.saveKey : null,
  );
  const found = columns.findIndex((x) => x.save.key === selectedKey);
  const selected = found >= 0 ? found : columns.length - 1;
  const select = (column: number) => {
    const save = columns[column];
    if (save && playthroughId) selectSave(playthroughId, save.save.key);
  };
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? selected;
  const openColumn = campaign.open
    ? columns.findIndex((x) => x.save.key === campaign.open!.save.key)
    : -1;
  // The selection follows a step to another save, as the open marker does.
  const openKey = campaign.saves.find((x) => x.save.isOpen)?.save.key ?? null;
  useEffect(() => {
    if (!playthroughId || !openKey) return;
    const { lastOpen } = useBySaveView.getState();
    if (lastOpen?.campaignId === playthroughId && lastOpen.saveKey !== openKey)
      selectSave(playthroughId, openKey);
    useBySaveView.setState({ lastOpen: { campaignId: playthroughId, saveKey: openKey } });
  }, [playthroughId, openKey]);
  const [opening, setOpening] = useState(false);
  const selectedSave = columns[selected];
  const openSelected = async () => {
    if (!nav || !selectedSave || !playthroughId) return;
    selectSave(playthroughId, selectedSave.save.key);
    setOpening(true);
    try {
      await openCampaignSave(nav, selectedSave.save);
    } finally {
      setOpening(false);
    }
  };

  // Rows keep the order of the selected save while the pointer moves. A
  // country without a value there joins the end only while it has one.
  const order = useMemo(() => (selected >= 0 ? rowsAt(rows, selected) : []), [rows, selected]);
  const absent = useMemo(
    () => (selected >= 0 ? rows.filter((row) => row.cells[selected] === null) : []),
    [rows, selected],
  );
  const shownRows =
    hovered === null ? order : [...order, ...absent.filter((row) => row.cells[hovered] !== null)];

  if (!columns.length || selected < 0) {
    return (
      <div className="flex flex-col gap-3">
        <StatusLine campaign={campaign} />
        <Alert.Error msg={error} />
        <Foot campaign={campaign} chart={chart} />
      </div>
    );
  }
  const shownSave = columns[shown];
  const world = !chart;
  const openControl =
    campaign.open && selectedSave.save.key === campaign.open.save.key ? (
      <span className="font-medium">Open now</span>
    ) : selectedSave.save.isOpen ? (
      campaign.openOtherVersion && <span>The viewer shows another version of this file.</span>
    ) : (
      <Button
        variant="primary"
        disabled={!nav || opening || nav.opening !== null}
        onClick={() => void openSelected()}
      >
        {opening ? "Opening" : "Open save"}
      </Button>
    );
  return (
    <div className="flex flex-col gap-3">
      <StatusLine campaign={campaign} />
      <Alert.Error msg={error} />
      {chart && <ChartCountriesNote chart={chart} count={rows.length} loaded={loaded} />}
      <div
        role="group"
        tabIndex={0}
        aria-label="Campaign chart. Left and right arrows select an earlier or a later save."
        className="rounded-md focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:outline-none"
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          select(selected + (event.key === "ArrowLeft" ? -1 : 1));
        }}
      >
        <BySaveChart
          series={series}
          range={[columns[0].date, columns[columns.length - 1].date]}
          tick={figure.format}
          selectedDay={dayNumber(selectedSave.date)}
          openDay={openColumn >= 0 ? dayNumber(columns[openColumn].date) : null}
          hoverDay={hovered === null ? null : dayNumber(columns[hovered].date)}
          onPointer={(day) => setHovered(day === null ? null : nearestColumn(columns, day))}
          onPick={(day) => select(nearestColumn(columns, day))}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className={cx(
            "font-medium tabular-nums",
            hovered !== null && "text-gray-600 dark:text-gray-300",
          )}
          title={`${shownSave.save.name} · ${sourceText(shownSave.save)}`}
        >
          <SaveDate date={shownSave.date} />
          {world && amount(rows[0]?.cells[shown] ?? null) !== null && (
            <> · {figure.format(amount(rows[0].cells[shown])!)}</>
          )}
        </span>
        {/* The open control acts on the selected save only, so it hides while the pointer shows another. */}
        <span className={cx(hovered !== null && hovered !== selected && "invisible")}>
          {openControl}
        </span>
        <span className="ml-auto flex gap-2">
          <Button disabled={selected <= 0} onClick={() => select(selected - 1)}>
            Earlier save
          </Button>
          <Button disabled={selected >= columns.length - 1} onClick={() => select(selected + 1)}>
            Later save
          </Button>
        </span>
      </div>
      <p aria-live="polite" aria-atomic className="sr-only">
        Selected {formatLongDate(selectedSave.date)}, {selectedSave.save.name}
      </p>
      {!world && (
        <>
          <BySaveTable
            rows={shownRows}
            column={shown}
            dateLabel={formatLongDate(shownSave.date)}
            figure={figure}
            names={names}
          />
          {hovered === null && <NotAtThisSave rows={absent} column={selected} names={names} />}
        </>
      )}
      <Foot campaign={campaign} chart={chart} />
    </div>
  );
}

/** A date at one width, so the line beside it does not move as the date changes. */
function SaveDate({ date }: { date: { year: number; month: number; day: number } }) {
  return (
    <>
      {date.year}{" "}
      <span className="inline-grid">
        {MONTH_DAY_SIZERS}
        <span className="col-start-1 row-start-1">
          {MONTH_ABBR[date.month]} {date.day}
        </span>
      </span>
    </>
  );
}

/** Says when the filter gives one country, or none. */
function ChartCountriesNote({
  chart,
  count,
  loaded,
}: {
  chart: ChartCountries;
  count: number;
  loaded: boolean;
}) {
  const { updateTagFilter } = useEu4Actions();
  if (!loaded) return null;
  if (count === 1)
    return (
      <p className="flex items-center gap-2 text-sm">
        Only 1 country shown.
        <Button
          shape="none"
          variant="ghost"
          className="underline"
          aria-label="Add great powers"
          onClick={() => void updateTagFilter({ ai: "great" })}
        >
          + Greats
        </Button>
      </p>
    );
  if (count === 0 && chart.leftOut.length === 0)
    return <p className="text-sm">No country of the filter has a value in these saves.</p>;
  return null;
}

/** Progress, Stop and Resume, and downloads to retry: what needs an action. */
function StatusLine({ campaign }: { campaign: Eu4Campaign }) {
  const { saves, progress, paused, waitingUploads } = campaign;
  const done = saves.filter((x) => x.snapshot).length;
  const lost = saves.filter((x) => x.status === "failed" && x.retry);
  const action = progress ? (
    <Button onClick={campaign.stop}>Stop</Button>
  ) : paused ? (
    <Button onClick={campaign.analyze}>Resume</Button>
  ) : waitingUploads > 0 ? (
    <Button onClick={campaign.analyze}>Analyze</Button>
  ) : null;
  return (
    <>
      {(progress || paused || waitingUploads > 0) && (
        <div className="flex items-center gap-3 text-sm">
          <span role="status">
            {progress
              ? `${progress.completed} of ${progress.total} · ${progress.downloading ? "downloading" : "reading"}`
              : paused
                ? `${plural(done, "save", "saves")} of ${saves.length} analyzed.`
                : `${plural(waitingUploads, "more upload", "more uploads")}.`}
          </span>
          {action}
        </div>
      )}
      {lost.length > 0 && (
        <Alert variant="error">
          <Alert.Description className="flex flex-col gap-1 px-3 py-2">
            {lost.map((x) => (
              <span key={x.save.key} className="flex items-center gap-3">
                Could not download {x.save.name}.
                {!progress && <Button onClick={campaign.analyze}>Retry</Button>}
              </span>
            ))}
          </Alert.Description>
        </Alert>
      )}
    </>
  );
}

/** Add saves, and what the chart leaves out, folded into one line. */
function Foot({ campaign, chart }: { campaign: Eu4Campaign; chart: ChartCountries | null }) {
  const { saves, issues, nav } = campaign;
  const unreadable = saves.filter((x) => x.status === "failed" && !x.retry);
  const saveEntries = [
    ...unreadable.map((x) => `${x.save.name}: could not be read.`),
    ...(nav?.leftOut ?? []).map(
      ({ save, kept }) => `${save.name}: same date as ${kept.name}, which is shown.`,
    ),
    // A notice names a save that analysis left out, such as one of another campaign.
    ...issues.filter((issue) => !unreadable.some((x) => issue.startsWith(`${x.save.name}:`))),
  ];
  const tags = chart?.leftOut ?? [];
  const entries = [
    ...saveEntries,
    ...(tags.length
      ? [`${tags.join(", ")}: the game gives these tags to other countries later.`]
      : []),
    ...(nav?.truncated ? ["Only the latest 200 uploads are listed."] : []),
  ];
  const parts = [
    saveEntries.length > 0 && plural(saveEntries.length, "save", "saves"),
    tags.length > 0 && plural(tags.length, "country", "countries"),
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-start gap-3 text-sm">
      <AddSaves />
      {entries.length > 0 && (
        <details className="pt-2">
          <summary className="cursor-pointer text-gray-600 dark:text-gray-300">
            Not shown{parts.length ? `: ${parts.join(", ")}` : ""}
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {entries.map((entry, i) => (
              <li key={i}>{entry}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function AddSaves() {
  const { busy, chooseFiles, fileInput } = useAddCampaignSaves(EU4_SAVES, (issue) =>
    useEu4History.setState({ issues: [issue] }),
  );
  return (
    <>
      <Button className="self-start" disabled={busy} onClick={() => void chooseFiles()}>
        Add saves
      </Button>
      <input {...fileInput} tabIndex={-1} aria-label="Add campaign saves" className="sr-only" />
    </>
  );
}
