import { useCallback, useEffect, useMemo } from "react";
import { create } from "zustand";
import { Button } from "@/components/Button";
import { useVisualizationDispatch } from "@/components/viz";
import { useAnalysisQuery } from "@/features/campaign/analysis/useAnalysisQuery";
import { useAddCampaignSaves } from "@/features/campaign/useAddCampaignSaves";
import type { CampaignSaveFiles } from "@/features/campaign/useAddCampaignSaves";
import { saveSourceText } from "@/features/campaign/saveText";
import { dayNumber, formatLongDate } from "@/features/timeline/date";
import { eu4Analysis } from "@/features/eu4/analysis/analysisClient";
import { useEu4History } from "@/features/eu4/analysis/store";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";
import { useEu4Actions, useEu4Countries, useTagFilter } from "@/features/eu4/store";
import { getEu4Worker } from "@/features/eu4/worker/getEu4Worker";
import type { ChartCountries, CountryMetric } from "@/wasm/wasm_eu4";
import { BySaveChart } from "./BySaveChart";
import type { AxisMark, BySavePoint, BySaveSeries } from "./BySaveChart";
import { BySaveTable } from "./BySaveTable";
import { bySaveFigures } from "./figures";
import type { BySaveFigure, BySaveViz } from "./figures";
import { alignColumns, bySaveCsv, countryRows } from "./model";
import type { BySaveData } from "./model";
import { useEu4Campaign } from "./useEu4Campaign";
import type { Eu4Campaign } from "./useEu4Campaign";

const EU4_SAVES: CampaignSaveFiles = {
  pattern: /\.eu4$/i,
  accept: ".eu4",
  picker: { description: "EU4 saves", accept: { "application/pdx": [".eu4"] } },
};

/** The most countries that a filter gives a chart, before formed nations join them. */
const COUNTRY_LIMIT = 20;

/** The chart countries stay pinned until the filter or the campaign changes. */
const usePinned = create<{
  pinned: { campaignId: string; filter: string; countries: ChartCountries } | null;
}>()(() => ({ pinned: null }));

/** One value for each analyzed save of the campaign, as a chart and a table. */
export function CampaignHistory({ viz }: { viz: BySaveViz }) {
  const campaign = useEu4Campaign();
  const { saves, enabled } = campaign;
  if (saves.length < 2 && !enabled) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p>This is the only save of this campaign here.</p>
        <AddSaves />
      </div>
    );
  }
  if (!enabled) return <NotAnalyzed campaign={campaign} />;
  const figure = bySaveFigures[viz];
  return figure.metric ? (
    <CountryFigure campaign={campaign} figure={figure} metric={figure.metric} />
  ) : (
    <WorldFigure campaign={campaign} figure={figure} />
  );
}

function NotAnalyzed({ campaign }: { campaign: Eu4Campaign }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p>{countLine(campaign.saves)}</p>
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

function countLine(saves: readonly AnalysisSave[]) {
  const first = saves[0]?.save.date;
  const last = saves.at(-1)?.save.date;
  const range = first && last ? `, ${formatLongDate(first)} to ${formatLongDate(last)}` : "";
  const files = saves.length === 1 ? "1 local file" : `${saves.length} local files`;
  return `${saves.length === 1 ? "1 save" : `${saves.length} saves`}${range}: ${files}.`;
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
          values: at.map((i) => values[i] ?? null),
          was: [],
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
  const countries = useEu4Countries();
  const byTag = useMemo(() => new Map(countries.map((x) => [x.tag, x])), [countries]);
  const data = useMemo((): BySaveData => {
    const { columns, at } = alignColumns(snapshotIds, campaign.saves);
    if (!result || !chart) return { columns, rows: [] };
    return { columns, rows: countryRows(result, at, chart, byTag) };
  }, [result, snapshotIds, campaign.saves, chart, byTag]);
  return <BySaveView campaign={campaign} figure={figure} data={data} error={error} chart={chart} />;
}

/** The countries of the filter, pinned so that opening another save keeps them. */
function useChartCountries(campaignId: string | null) {
  const filter = useTagFilter();
  const key = JSON.stringify(filter);
  const current = usePinned((state) =>
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
        if (!cancelled) usePinned.setState({ pinned: { campaignId, filter: key, countries } });
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
}: {
  campaign: Eu4Campaign;
  figure: BySaveFigure;
  data: BySaveData;
  error: string | null;
  chart: ChartCountries | null;
}) {
  const { saves } = campaign;
  const series = useMemo(
    (): BySaveSeries[] =>
      data.rows.map((row) => ({
        key: row.key,
        label: row.label,
        color: row.color,
        points: row.values.flatMap((value, i): BySavePoint[] => {
          const column = data.columns[i];
          return value === null || !column.snapshot
            ? []
            : [{ snapshotId: column.snapshot.id, day: dayNumber(column.save.date), value }];
        }),
      })),
    [data],
  );
  const bySnapshot = useMemo(
    () => new Map(data.columns.map((x) => [x.snapshot!.id, x] as const)),
    [data.columns],
  );
  const describe = useCallback(
    (entry: BySaveSeries, point: BySavePoint) => {
      const column = bySnapshot.get(point.snapshotId);
      return [
        `${entry.label}: ${figure.format(point.value)}`,
        column ? formatLongDate(column.save.date) : "",
        column ? `${column.save.name} · ${saveSourceText(column.save)}` : "",
        column?.snapshot ? `Patch ${column.snapshot.gameVersion}` : "",
      ].filter(Boolean);
    },
    [bySnapshot, figure],
  );
  const marks = useMemo(() => axisMarks(saves), [saves]);
  const visualizationDispatch = useVisualizationDispatch();
  useEffect(() => {
    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: async () => toCsv(bySaveCsv(data)),
    });
  }, [data, visualizationDispatch]);
  const selected = data.columns.length - 1;
  return (
    <div className="flex flex-col gap-3">
      <StatusLine campaign={campaign} />
      {error && <p className="text-rose-700 dark:text-rose-300">{error}</p>}
      {chart && <FewCountries count={data.rows.length} />}
      {saves.length > 0 && (
        <BySaveChart
          series={series}
          marks={marks}
          range={[saves[0].save.date, saves[saves.length - 1].save.date]}
          axisName={figure.axis}
          describe={describe}
          endLabels={series.length <= 8}
        />
      )}
      {selected >= 0 && <BySaveTable data={data} column={selected} figure={figure} chart={chart} />}
      <OpenSaveNote saves={saves} />
      <AddSaves />
    </div>
  );
}

function FewCountries({ count }: { count: number }) {
  const { updateTagFilter } = useEu4Actions();
  if (count !== 1) return null;
  return (
    <p className="flex items-center gap-2 text-sm">
      Only 1 country shown.
      <Button
        shape="none"
        variant="ghost"
        className="underline"
        onClick={() => void updateTagFilter({ ai: "great" })}
      >
        + Greats
      </Button>
    </p>
  );
}

/** Saves that have no dot get a mark on the axis at their date, with the reason. */
function axisMarks(saves: readonly AnalysisSave[]): AxisMark[] {
  return saves.flatMap((x): AxisMark[] => {
    if (x.snapshot) return [];
    const reason =
      x.status === "failed"
        ? `Could not read ${x.save.name}${x.error ? `: ${x.error}` : ""}`
        : x.status === "analyzing"
          ? `Analyzing ${x.save.name}`
          : `${x.save.name} waits for analysis`;
    return [{ key: x.save.key, day: dayNumber(x.save.date), reason }];
  });
}

function StatusLine({ campaign }: { campaign: Eu4Campaign }) {
  const { saves, progress, paused, issues } = campaign;
  const done = saves.filter((x) => x.snapshot).length;
  const failed = saves.filter((x) => x.status === "failed");
  return (
    <div role="status" className="flex flex-col gap-1 text-sm">
      {progress ? (
        <p className="flex items-center gap-3">
          <span>
            {progress.completed} of {progress.total} · reading
          </span>
          <Button onClick={campaign.stop}>Stop</Button>
        </p>
      ) : paused ? (
        <p className="flex items-center gap-3">
          <span>
            {done} of {saves.length} saves analyzed.
          </span>
          <Button onClick={campaign.analyze}>Resume</Button>
        </p>
      ) : null}
      {failed.map((x) => (
        <p key={x.save.key}>Could not read {x.save.name}.</p>
      ))}
      {issues.length > 0 && failed.length === 0 && !progress && (
        <details>
          <summary className="cursor-pointer">{issues.length} analysis notices</summary>
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

function OpenSaveNote({ saves }: { saves: readonly AnalysisSave[] }) {
  const open = saves.find((x) => x.save.isOpen);
  if (open?.snapshot) return null;
  return (
    <p className="text-sm text-gray-600 dark:text-gray-300">The open save is not on this chart.</p>
  );
}

function AddSaves() {
  const { busy, chooseFiles, fileInput } = useAddCampaignSaves(EU4_SAVES, (issue) =>
    useEu4History.setState({ issues: [issue] }),
  );
  return (
    <>
      <Button disabled={busy} onClick={() => void chooseFiles()}>
        Add saves
      </Button>
      <input {...fileInput} aria-label="Add campaign saves" className="sr-only" />
    </>
  );
}

function toCsv(rows: ReturnType<typeof bySaveCsv>) {
  const cell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const header = ["country", "name", "date", "save", "value"] as const;
  return [header.join(","), ...rows.map((row) => header.map((key) => cell(row[key])).join(","))]
    .map((line) => `${line}\n`)
    .join("");
}
