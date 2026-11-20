import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { useVisualizationDispatch } from "@/components/viz";
import { useAnalysisQuery } from "@/features/campaign/analysis/useAnalysisQuery";
import { useAddCampaignSaves } from "@/features/campaign/useAddCampaignSaves";
import type { CampaignSaveFiles } from "@/features/campaign/useAddCampaignSaves";
import { openCampaignSave } from "@/features/campaign/openSave";
import { dayNumber, formatLongDate } from "@/features/timeline/date";
import { eu4Analysis } from "@/features/eu4/analysis/analysisClient";
import { useEu4History } from "@/features/eu4/analysis/store";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";
import { useEu4Actions, useEu4Countries, useTagFilter } from "@/features/eu4/store";
import { getEu4Worker } from "@/features/eu4/worker/getEu4Worker";
import type { ChartCountries, CountryMetric, CountryValue, TagSwitch } from "@/wasm/wasm_eu4";
import { BySaveChart } from "./BySaveChart";
import type { AxisMark, BySavePoint, BySaveSeries } from "./BySaveChart";
import { BySaveTable } from "./BySaveTable";
import { bySaveFigures } from "./figures";
import type { BySaveFigure, BySaveViz } from "./figures";
import { alignColumns, amount, bySaveCsv, countryCount, countryRows, sourceText } from "./model";
import type { BySaveData } from "./model";
import { useEu4Campaign } from "./useEu4Campaign";
import { selectSave, useBySaveView } from "./view";
import type { Eu4Campaign } from "./useEu4Campaign";

const EU4_SAVES: CampaignSaveFiles = {
  pattern: /\.eu4$/i,
  accept: ".eu4",
  picker: { description: "EU4 saves", accept: { "application/pdx": [".eu4"] } },
};

/** The most countries that a filter gives a chart, before formed nations join them. */
const COUNTRY_LIMIT = 20;

const NO_JOINS: readonly TagSwitch[] = [];

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
          label: "All countries",
          color: "#64748b",
          values: at.map((i): CountryValue => {
            const value = values[i];
            return value === null || value === undefined ? "noRecord" : { value };
          }),
          was: [],
        },
      ],
    };
  }, [result, snapshotIds, campaign.saves]);
  return (
    <BySaveView
      campaign={campaign}
      figure={figure}
      data={data}
      error={error}
      chart={null}
      joins={NO_JOINS}
    />
  );
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
  const countries = useEu4Countries();
  const byTag = useMemo(() => new Map(countries.map((x) => [x.tag, x])), [countries]);
  // Rows pair by the switches that the values were judged on.
  const joins = result?.joins ?? NO_JOINS;
  const data = useMemo((): BySaveData => {
    const { columns, at } = alignColumns(snapshotIds, campaign.saves);
    if (!result || !chart) return { columns, rows: [] };
    return { columns, rows: countryRows(result.countries, at, chart.tags, result.joins, byTag) };
  }, [result, snapshotIds, campaign.saves, chart, byTag]);
  return (
    <BySaveView
      campaign={campaign}
      figure={figure}
      data={data}
      error={error}
      chart={chart}
      joins={joins}
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

function BySaveView({
  campaign,
  figure,
  data,
  error,
  chart,
  joins,
  loaded = true,
}: {
  campaign: Eu4Campaign;
  figure: BySaveFigure;
  data: BySaveData;
  error: string | null;
  chart: ChartCountries | null;
  /** The switches that pair rows. */
  joins: readonly TagSwitch[];
  /** False while the values are still coming. */
  loaded?: boolean;
}) {
  const { saves, nav, playthroughId } = campaign;
  const series = useMemo(
    (): BySaveSeries[] =>
      data.rows.map((row) => ({
        key: row.key,
        label: row.label,
        color: row.color,
        points: row.values.map(amount).flatMap((value, i): BySavePoint[] => {
          const { save, date } = data.columns[i];
          return value === null ? [] : [{ saveKey: save.key, day: dayNumber(date), value }];
        }),
      })),
    [data],
  );
  const byKey = useMemo(() => new Map(data.columns.map((x) => [x.save.key, x])), [data.columns]);
  const describe = useCallback(
    (entry: BySaveSeries, point: BySavePoint) => {
      const column = byKey.get(point.saveKey);
      return [
        `${entry.label}: ${figure.describe(point.value)}`,
        column ? formatLongDate(column.date) : "",
        column ? `${column.save.name} · ${sourceText(column.save)}` : "",
        column?.snapshot ? `Patch ${column.snapshot.gameVersion}` : "",
      ].filter(Boolean);
    },
    [byKey, figure],
  );
  const marks = useMemo(() => axisMarks(saves), [saves]);
  const visualizationDispatch = useVisualizationDispatch();
  useEffect(() => {
    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: async () => bySaveCsv(data, figure),
    });
  }, [data, figure, visualizationDispatch]);

  // The latest save with dots is selected at first.
  const selectedKey = useBySaveView((state) =>
    state.selected?.campaignId === playthroughId ? state.selected.saveKey : null,
  );
  const selectedAt = saves.findIndex((x) => x.save.key === selectedKey);
  const at = selectedAt >= 0 ? selectedAt : saves.findLastIndex((x) => byKey.has(x.save.key));
  const selected = at >= 0 ? saves[at] : null;
  const columnAt = selected ? data.columns.indexOf(byKey.get(selected.save.key)!) : -1;
  const select = (index: number) => {
    const save = saves[index];
    if (save && playthroughId) selectSave(playthroughId, save.save.key);
  };
  const open = campaign.open && byKey.has(campaign.open.save.key) ? campaign.open : null;
  // The selection follows a step to another save, as the open marker does.
  const openKey = saves.find((x) => x.save.isOpen)?.save.key ?? null;
  useEffect(() => {
    if (!playthroughId || !openKey) return;
    const { lastOpen } = useBySaveView.getState();
    if (lastOpen?.campaignId === playthroughId && lastOpen.saveKey !== openKey)
      selectSave(playthroughId, openKey);
    useBySaveView.setState({ lastOpen: { campaignId: playthroughId, saveKey: openKey } });
  }, [playthroughId, openKey]);
  const [opening, setOpening] = useState(false);
  const openSelected = async () => {
    if (!nav || !selected || !playthroughId) return;
    selectSave(playthroughId, selected.save.key);
    setOpening(true);
    try {
      await openCampaignSave(nav, selected.save);
    } finally {
      setOpening(false);
    }
  };
  // "Open now" only where the snapshot is of the bytes that the viewer parsed.
  const openControl =
    campaign.open && selected?.save.key === campaign.open.save.key ? (
      <span className="font-medium">Open now</span>
    ) : selected?.save.isOpen ? (
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
  const steppers = (
    <>
      <Button disabled={at <= 0} onClick={() => select(at - 1)}>
        Earlier save
      </Button>
      <Button disabled={at >= saves.length - 1} onClick={() => select(at + 1)}>
        Later save
      </Button>
    </>
  );
  return (
    <div className="flex flex-col gap-3">
      <StatusLine campaign={campaign} />
      <Alert.Error msg={error} />
      {chart && <ChartCountriesNote chart={chart} rows={data.rows} joins={joins} loaded={loaded} />}
      {saves.length > 0 && (
        <div
          role="group"
          tabIndex={0}
          aria-label="Campaign chart. Left and right arrows select an earlier or a later save."
          className="rounded-md focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:outline-none"
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            select(at + (event.key === "ArrowLeft" ? -1 : 1));
          }}
        >
          <BySaveChart
            series={series}
            marks={marks}
            range={[saves[0].date, saves[saves.length - 1].date]}
            axisName={figure.axis}
            describe={describe}
            endLabels={series.length <= 8}
            selectedDay={selected ? dayNumber(selected.date) : null}
            openDay={open ? dayNumber(open.date) : null}
            onSelect={(key) => select(saves.findIndex((x) => x.save.key === key))}
          />
        </div>
      )}
      {selected && (
        <BySaveTable
          data={data}
          selected={selected}
          column={columnAt >= 0 ? columnAt : null}
          reason={columnAt >= 0 ? null : (axisMarks([selected])[0]?.reason ?? "Reading this save")}
          figure={figure}
          joins={joins}
          openControl={openControl}
          steppers={steppers}
        />
      )}
      {!campaign.open && (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          The open save is not on this chart.
        </p>
      )}
      <AddSaves />
    </div>
  );
}

/** Says when the filter gives one country, and which chosen tags the chart leaves out. */
function ChartCountriesNote({
  chart,
  rows,
  joins,
  loaded,
}: {
  chart: ChartCountries;
  rows: BySaveData["rows"];
  joins: readonly TagSwitch[];
  loaded: boolean;
}) {
  const { updateTagFilter } = useEu4Actions();
  const count = countryCount(rows, joins);
  const shown = chart.leftOut.slice(0, 8).join(", ");
  const more = chart.leftOut.length > 8 ? ` and ${chart.leftOut.length - 8} more` : "";
  return (
    <>
      {loaded && count === 1 && (
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
      )}
      {chart.leftOut.length > 0 && (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Left out: {shown}
          {more}. The game gives these tags to other countries later.
        </p>
      )}
      {loaded && count === 0 && chart.leftOut.length === 0 && (
        <p className="text-sm">No country of the filter has a value in these saves.</p>
      )}
    </>
  );
}

/** Saves that have no dot get a mark on the axis at their date, with the reason. */
function axisMarks(saves: readonly AnalysisSave[]): AxisMark[] {
  return saves.flatMap((x): AxisMark[] => {
    if (x.snapshot) return [];
    const reason =
      x.status === "failed"
        ? `Could not ${x.retry ? "download" : "read"} ${x.save.name}${x.error ? `: ${x.error}` : ""}`
        : x.status === "analyzing"
          ? `Analyzing ${x.save.name}`
          : `${x.save.name} waits for analysis`;
    return [{ key: x.save.key, day: dayNumber(x.date), reason }];
  });
}

/** Shown while analysis runs or stopped, or when a save failed or was left out. */
function StatusLine({ campaign }: { campaign: Eu4Campaign }) {
  const { saves, progress, paused, issues, waitingUploads, nav } = campaign;
  const done = saves.filter((x) => x.snapshot).length;
  const failed = saves.filter((x) => x.status === "failed");
  const leftOut = nav?.leftOut ?? [];
  const action = progress ? (
    <Button onClick={campaign.stop}>Stop</Button>
  ) : paused ? (
    <Button onClick={campaign.analyze}>Resume</Button>
  ) : waitingUploads > 0 ? (
    <Button onClick={campaign.analyze}>Analyze</Button>
  ) : null;
  return (
    <div className="flex flex-col gap-2 text-sm">
      {(progress || paused || waitingUploads > 0) && (
        <div className="flex items-center gap-3">
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
      {failed.length > 0 && (
        <Alert variant="error">
          <Alert.Description className="flex flex-col gap-1 px-3 py-2">
            {failed.map((x) => (
              <span key={x.save.key} className="flex items-center gap-3">
                Could not {x.retry ? "download" : "read"} {x.save.name}.
                {x.retry && !progress && <Button onClick={campaign.analyze}>Retry</Button>}
              </span>
            ))}
          </Alert.Description>
        </Alert>
      )}
      {leftOut.length > 0 && (
        <p>
          Left out:{" "}
          {leftOut.map(({ save, kept }) => `${save.name} (same date as ${kept.name})`).join(", ")}.
        </p>
      )}
      {nav?.truncated && <p>Shows the latest 200 uploads.</p>}
      {issues.length > 0 && !progress && (
        <details>
          <summary className="cursor-pointer">
            {plural(issues.length, "analysis notice", "analysis notices")}
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {issues.map((issue, i) => (
              <li key={i}>{issue}</li>
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
