import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { useVisualizationDispatch } from "@/components/viz";
import { useAnalysisQuery } from "@/features/campaign/analysis/useAnalysisQuery";
import type { SnapshotSelection } from "@/features/campaign/analysis/session";
import { dateFromDayNumber, dayNumber, formatLongDate } from "@/features/timeline/date";
import { eu4Analysis } from "@/features/eu4/analysis/analysisClient";
import { useEu4History } from "@/features/eu4/analysis/store";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";
import { useEu4Actions, useEu4Countries, useEu4Meta, useTagFilter } from "@/features/eu4/store";
import { getEu4Worker } from "@/features/eu4/worker/getEu4Worker";
import type {
  ChartCountries,
  CountryMetric,
  CountryTag,
  History,
  LineageRivals,
  ManaFigure,
} from "@/wasm/wasm_eu4";
import { useWatchStart } from "./useWatchStart";
import { useOpenSlot } from "./useOpenSlot";
import { useCampaignSheet } from "@/features/eu4/store";
import {
  MANA_TYPES,
  MANA_USES,
  baselineOf,
  manaFigure,
  signed,
  shares,
  typeName,
  manaUseColors,
  sinceHead,
  useFullName,
  useName,
  emptyText,
  listText,
  spentNothing,
  manaReading,
  notCarried,
  nothingText,
  notCarriedText,
} from "./mana";
import type { Baseline, ManaView } from "./mana";
import { ManaUseView } from "./ManaUse";
import { ManaViewRow } from "./ManaControls";
import { formatInt } from "@/lib/format";
import { isDarkMode } from "@/lib/dark";
import { Dialog } from "@/components/Dialog";
import { forgetCampaign } from "@/features/campaign/analysis/useCampaignStore";
import { storeFooter } from "@/features/campaign/analysis/campaignStore";
import { Collapsible } from "@/components/Collapsible";
import XMarkIcon from "@heroicons/react/16/solid/XMarkIcon";
import { builtFigures, campaignFigures } from "./figures";
import type { CampaignFigure, FigureId, ManaOption } from "./figures";
import { axisBounds, fitView, saveSpacing, valueOf } from "./history";
import { HistoryChart } from "./HistoryChart";
import { HistoryHeader } from "./HistoryHeader";
import {
  alignColumns,
  byKey,
  campaignCsv,
  lineageRows,
  sourceText,
  tagNote,
  unclearTags,
} from "./model";
import type { CampaignData, CampaignRow, CountryInfo } from "./model";
import { keptText, nameNear } from "./model";
import { AddSaves } from "./AddSaves";
import { analysisBands, pauseNote } from "./analysisBand";
import type { Band } from "./analysisBand";
import { ChartRow } from "./ChartRow";
import { PendingMark, byStatus } from "./HistoryOverlay";
import type { PendingSave } from "./HistoryOverlay";
import { NextStep, canWatchFiles } from "@/features/eu4/features/campaign/NextStep";
import { nameOf, useHistoryModel } from "./useHistoryModel";
import { selectSave, setZoom, useCampaignView, useColorMode, useFocus, useZoom } from "./view";
import { isGeneratedTag, keepRivals, rivalRows, subjectOf, withRivals } from "./history";
import type { ColorMode } from "./history";
import type { Eu4Campaign } from "./useEu4Campaign";

/** The most countries that a filter gives a chart. */
const COUNTRY_LIMIT = 20;

/**
 * Every save of the campaign: the next step until there are two, then a
 * chart of the saves that are read, with the rest marked on its axis.
 */
export function CampaignHistory({
  figure: id,
  campaign,
}: {
  figure: FigureId;
  campaign: Eu4Campaign;
}) {
  const { enabled, paused, playthroughId } = campaign;
  // Local saves are read without a press; a stopped campaign waits for Resume.
  useEffect(() => {
    if (playthroughId && !enabled && !paused)
      useEu4History.getState().enableAnalysis(playthroughId);
  }, [playthroughId, enabled, paused]);
  const figure = campaignFigures[id];
  return (
    <div className="flex flex-col gap-3">
      <AnalysisBand campaign={campaign} />
      {campaign.saves.length < 2 ? (
        <NextStep
          date={campaign.saves[0]?.date ?? null}
          pause={pauseNote(campaign.pause, campaign.issues)}
          onResume={campaign.resume}
        />
      ) : (
        <FigureView campaign={campaign} figure={figure} />
      )}
    </div>
  );
}

/** The chart of a figure, by its kind. */
function FigureView({ campaign, figure }: { campaign: Eu4Campaign; figure: CampaignFigure }) {
  switch (figure.kind) {
    case "country":
      return <CountryFigure campaign={campaign} figure={figure} metric={figure.metric} />;
    case "world":
      return <WorldFigure campaign={campaign} figure={figure} />;
    case "mana":
      return figure.view === "use" ? (
        <ManaUseFigure campaign={campaign} figure={figure} />
      ) : (
        <ManaCountryFigure campaign={campaign} figure={figure} option={figure.view} />
      );
    default:
      return figure satisfies never;
  }
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const WORLD_DEVELOPMENT = { kind: "worldDevelopment" } as const;
const WORLD_AUTONOMY_DEVELOPMENT = { kind: "worldAutonomyDevelopment" } as const;
const worldQuery = (figure: Extract<CampaignFigure, { kind: "world" }>) =>
  figure.measure === "raw" ? WORLD_DEVELOPMENT : WORLD_AUTONOMY_DEVELOPMENT;
const PLAYED_COUNTRIES = { kind: "playedCountries" } as const;

function WorldFigure({
  campaign,
  figure,
}: {
  campaign: Eu4Campaign;
  figure: Extract<CampaignFigure, { kind: "world" }>;
}) {
  const { result, snapshotIds, error } = useAnalysisQuery(
    eu4Analysis,
    useEu4History,
    campaign.playthroughId,
    worldQuery(figure),
  );
  const data = useMemo(
    () => worldData(result, snapshotIds, campaign.saves),
    [result, snapshotIds, campaign.saves],
  );
  // The CSV has the figures of the countries too.
  const countries = useChartCountries(campaign.playthroughId);
  return (
    <CampaignView
      campaign={campaign}
      figure={figure}
      data={data}
      error={error}
      chart={null}
      csvTags={countries?.tags ?? []}
    />
  );
}

/** The world total as the one row of the chart. */
function worldData(
  result: History | null,
  snapshotIds: readonly string[],
  saves: readonly AnalysisSave[],
): CampaignData {
  const { columns, at } = alignColumns(snapshotIds, saves);
  const values = result?.rows.map((row) => row.value ?? null) ?? [];
  return {
    columns,
    rows: [
      {
        key: "world",
        lineage: null,
        played: false,
        cells: at.map((i) => {
          const value = values[i];
          return value === null || value === undefined
            ? null
            : { kind: "value" as const, tag: "", held: 0, value };
        }),
      },
    ],
  };
}

/** A query whose answer is a series of each lineage. */
type Eu4SeriesQuery =
  | { kind: "countrySeries"; tags: CountryTag[]; metric: CountryMetric }
  | { kind: "manaSeries"; tags: CountryTag[]; figure: ManaFigure };

/**
 * Every figure of these countries and the world, as one CSV. The figures are
 * asked of the worker now, so the CSV has each one, not only the chart's.
 */
async function everyFigureCsv(
  campaign: Eu4Campaign,
  tags: readonly CountryTag[],
  names: ReadonlyMap<string, CountryInfo>,
) {
  const { playthroughId: campaignId, saves } = campaign;
  const tables: { figure: { title: string; unit: string }; data: CampaignData }[] = [];
  if (!campaignId) return campaignCsv(tables, names);
  const selection = shownSelection(saves);
  // Another read or a watched write started a new session of the figures.
  const stale = () => Error("The figures changed while the CSV was made. Try again.");
  const series = async (identity: string, query: Eu4SeriesQuery) => {
    const reply = await eu4Analysis.query({ campaignId, identity, sequence: 0, selection, query });
    if (reply.outcome.status !== "ok") throw stale();
    const { columns, at } = alignColumns(reply.snapshotIds, saves);
    return { columns, rows: lineageRows(reply.outcome.value, at) };
  };
  for (const id of builtFigures) {
    const figure = campaignFigures[id];
    switch (figure.kind) {
      case "country": {
        const query = { kind: "countrySeries" as const, tags: [...tags], metric: figure.metric };
        tables.push({ figure, data: await series(`csv ${id}`, query) });
        break;
      }
      case "world": {
        const call = { campaignId, identity: `csv ${id}`, sequence: 0 };
        const reply = await eu4Analysis.query({ ...call, query: worldQuery(figure) });
        if (reply.outcome.status !== "ok") throw stale();
        tables.push({ figure, data: worldData(reply.outcome.value, reply.snapshotIds, saves) });
        break;
      }
      // Mana has its own tables, by type and use, below.
      case "mana":
        break;
      default:
        figure satisfies never;
    }
  }
  // Mana: each type's pool, and its spend on each use, of the countries a save carries.
  for (const ty of MANA_TYPES) {
    const type = typeName[ty];
    const pool = { kind: "pool" as const, type: ty };
    tables.push({
      figure: { title: `${type} mana banked`, unit: "mana points" },
      data: await series(`csv pool ${ty}`, { kind: "manaSeries", tags: [...tags], figure: pool }),
    });
    for (const use of MANA_USES) {
      const spent = { kind: "spent" as const, types: [ty], uses: [use] };
      tables.push({
        figure: {
          title: `${type} mana spent: ${useFullName[use]}`,
          unit: "mana points",
        },
        data: await series(`csv ${ty} ${use}`, {
          kind: "manaSeries",
          tags: [...tags],
          figure: spent,
        }),
      });
    }
  }
  return campaignCsv(tables, names);
}

function CountryFigure({
  campaign,
  figure,
  metric,
}: {
  campaign: Eu4Campaign;
  figure: CampaignFigure;
  metric: CountryMetric;
}) {
  const chart = useChartCountries(campaign.playthroughId);
  const shown = useShownSnapshots(campaign);
  const colorMode = useColorMode("line");
  const rivals = useRivals(campaign, chart, shown, colorMode);
  const tags = rivals.tags;
  const query = useMemo(
    () => (tags ? { kind: "countrySeries" as const, tags, metric } : null),
    [tags, metric],
  );
  const { result, snapshotIds, error } = useAnalysisQuery(
    eu4Analysis,
    useEu4History,
    campaign.playthroughId,
    query,
    shown,
  );
  const data = useMemo((): CampaignData => {
    const { columns, at } = alignColumns(snapshotIds, campaign.saves);
    return {
      columns,
      rows: result ? lineageRows(result, at) : [],
      unclear: result ? unclearTags(result) : [],
    };
  }, [result, snapshotIds, campaign.saves]);
  // Held by the figure, so a wait for rivals or for more countries keeps its lines.
  // The rows are held with the chart they belong to, so a filter change draws neither
  // the old rows as the world total nor the new filter's notes beside them.
  const now = useMemo(() => ({ data, chart }), [data, chart]);
  const { data: kept, chart: keptChart } = useHeld(now, !!result, `country ${metric}`);
  const leftOutPlayed = useLeftOutPlayed(campaign, keptChart, shown);
  return (
    <CampaignView
      campaign={campaign}
      figure={figure}
      data={kept}
      error={error}
      chart={keptChart}
      leftOutPlayed={leftOutPlayed}
      loaded={kept.columns.length > 0}
      csvTags={chart?.tags ?? []}
      colorMode={colorMode}
      rivals={rivals.answer}
    />
  );
}

/** By use: the chart's countries and the sheet's parts around the use view. */
function ManaUseFigure({ campaign, figure }: { campaign: Eu4Campaign; figure: CampaignFigure }) {
  const chart = useChartCountries(campaign.playthroughId);
  const shown = useShownSnapshots(campaign);
  const countries = useEu4Countries();
  const names = useMemo(() => new Map(countries.map((x) => [x.tag, x])), [countries]);
  const tags = chart?.tags ?? null;
  const leftOutPlayed = useLeftOutPlayed(campaign, chart, shown);
  const visualizationDispatch = useVisualizationDispatch();
  useEffect(() => {
    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: () => everyFigureCsv(campaign, tags ?? [], names),
    });
  }, [campaign, tags, names, visualizationDispatch]);
  return (
    <ManaUseView
      campaign={campaign}
      figure={figure}
      tags={tags}
      selection={shown}
      names={names}
      chartRow={<ChartRow />}
      foot={(notCarried, unclear) => (
        <Foot
          campaign={campaign}
          chart={chart}
          unclear={unclear.map((tag) => tagNote(names, tag))}
          leftOutPlayed={leftOutPlayed}
          notes={notCarried ? [notCarried] : []}
        />
      )}
    />
  );
}

/** The generated tags that the chart leaves out, with the saves that say they were played. */
function useLeftOutPlayed(
  campaign: Eu4Campaign,
  chart: ChartCountries | null,
  shown: SnapshotSelection,
): LeftOutPlayed[] {
  const played = useAnalysisQuery(
    eu4Analysis,
    useEu4History,
    campaign.playthroughId,
    chart?.leftOut.length ? PLAYED_COUNTRIES : null,
    shown,
  );
  return useMemo(() => {
    if (!chart || !played.result) return [];
    const { columns, at } = alignColumns(played.snapshotIds, campaign.saves);
    return chart.leftOut.flatMap((tag) => {
      const saves = at.flatMap((i, k) => (played.result![i]?.includes(tag) ? [columns[k]] : []));
      return saves.length ? [{ tag, saves }] : [];
    });
  }, [chart, played.result, played.snapshotIds, campaign.saves]);
}

/** By country and Banked: a mana figure of each country, with the since column. */
function ManaCountryFigure({
  campaign,
  figure,
  option,
}: {
  campaign: Eu4Campaign;
  figure: CampaignFigure;
  option: Exclude<ManaOption, "use">;
}) {
  const view = useCampaignSheet().mana;
  const chart = useChartCountries(campaign.playthroughId);
  const shown = useShownSnapshots(campaign);
  const colorMode = useColorMode("mana");
  const rivals = useRivals(campaign, chart, shown, colorMode);
  const tags = rivals.tags;
  const query = useMemo(
    () => (tags ? { kind: "manaSeries" as const, tags, figure: manaFigure(option, view) } : null),
    [tags, option, view],
  );
  // Banked sets the same type's spend beside the pool.
  const spentQuery = useMemo(
    () =>
      tags && option === "banked"
        ? {
            kind: "manaSeries" as const,
            tags,
            figure: manaFigure("country", { ...view, types: view.pool, use: "all" }),
          }
        : null,
    [tags, option, view],
  );
  const usesQuery = useMemo(
    () =>
      tags && option === "country"
        ? { kind: "manaUses" as const, tags, types: [...MANA_TYPES] }
        : null,
    [tags, option],
  );
  const id = campaign.playthroughId;
  const {
    result,
    snapshotIds,
    error,
    loading: queryLoading,
  } = useAnalysisQuery(eu4Analysis, useEu4History, id, query, shown);
  const spent = useAnalysisQuery(eu4Analysis, useEu4History, id, spentQuery, shown);
  const uses = useAnalysisQuery(eu4Analysis, useEu4History, id, usesQuery, shown);
  const data = useMemo((): CampaignData => {
    const { columns, at } = alignColumns(snapshotIds, campaign.saves);
    return {
      columns,
      rows: result ? lineageRows(result, at) : [],
      unclear: result ? unclearTags(result) : [],
    };
  }, [result, snapshotIds, campaign.saves]);
  // The rows and what Mana draws beside them, aligned to the same columns and held
  // together, so a wait for more countries keeps every column of the chart.
  const bundle = useMemo(
    () => ({
      data,
      chart,
      spent: spent.result
        ? byKey(spent.result, spent.snapshotIds, data.columns, (x, i) => valueOf(x.values[i]))
        : null,
      uses: uses.result
        ? byKey(uses.result, uses.snapshotIds, data.columns, (x, i) => x.values[i] ?? null)
        : null,
      notCarried: notCarried(result, tags),
      hasResult: !!result,
    }),
    [data, chart, result, tags, spent.result, spent.snapshotIds, uses.result, uses.snapshotIds],
  );
  // An extra answer counts only once it read the same saves as the figure's.
  const same = (ids: readonly string[]) => ids.join("\n") === snapshotIds.join("\n");
  const ready =
    !!result &&
    (option !== "banked" || (!!spent.result && same(spent.snapshotIds))) &&
    (option !== "country" || (!!uses.result && same(uses.snapshotIds)));
  const {
    data: kept,
    chart: keptChart,
    ...extras
  } = useHeld(bundle, ready, JSON.stringify(manaFigure(option, view)));
  const leftOutPlayed = useLeftOutPlayed(campaign, keptChart, shown);
  return (
    <CampaignView
      campaign={campaign}
      figure={figure}
      data={kept}
      error={error}
      chart={keptChart}
      leftOutPlayed={leftOutPlayed}
      loaded={kept.columns.length > 0}
      csvTags={chart?.tags ?? []}
      colorMode={colorMode}
      rivals={rivals.answer}
      viewRow={<ManaViewRow option={option} />}
      mana={{
        option,
        view,
        ...extras,
        reading: manaReading({
          countriesLoading: !tags,
          queryLoading,
          campaignReading: !!campaign.progress,
          hasResult: !!result,
        }),
      }}
    />
  );
}

/**
 * The rivals of the chart's countries on each date, and the chart's countries
 * with the played countries' rivals added while their rivals are in color, so
 * a rival outside the filter still has its line.
 */
function useRivals(
  campaign: Eu4Campaign,
  chart: ChartCountries | null,
  shown: SnapshotSelection,
  colorMode: ColorMode,
) {
  const multiplayer = useEu4Meta().multiplayer;
  const wanted = colorMode === "rivals" && !multiplayer;
  const followed = useFocus(campaign.playthroughId).subject;
  // The countries whose rivals are asked: the filter's, grown with the rivals the chart
  // adds, so a followed rival from outside the filter has its own rivals too.
  const [asked, setAsked] = useState<{ chart: ChartCountries | null; tags: string[] }>({
    chart: null,
    tags: [],
  });
  if (chart && asked.chart !== chart) setAsked({ chart, tags: chart.tags });
  const askTags = asked.chart === chart ? asked.tags : null;
  const query = useMemo(
    () => (askTags && wanted ? { kind: "rivals" as const, tags: askTags } : null),
    [askTags, wanted],
  );
  const { result, snapshotIds } = useAnalysisQuery(
    eu4Analysis,
    useEu4History,
    campaign.playthroughId,
    query,
    shown,
  );
  const fresh = useMemo(
    () => (chart && wanted && result ? withRivals(chart.tags, result, followed) : null),
    [chart, wanted, result, followed],
  );
  if (chart && fresh && askTags && fresh.some((tag) => !askTags.includes(tag)))
    setAsked({ chart, tags: [...new Set([...askTags, ...fresh])] });
  // While a larger ask runs, the last answer stays, so the chart keeps its lines.
  const [held, setHeld] = useState<{
    chart: ChartCountries;
    tags: string[];
    answer: { result: readonly LineageRivals[]; snapshotIds: readonly string[] };
  } | null>(null);
  if (chart && fresh && result && (held?.answer.result !== result || held.tags !== fresh))
    setHeld({ chart, tags: fresh, answer: { result, snapshotIds } });
  if (!wanted) return { tags: chart?.tags ?? null, answer: null };
  // The figure waits for a new chart's first answer, so its query runs once; the last
  // answer stays meanwhile, as the held rows still draw that chart's rivals.
  return chart && held?.chart === chart ? held : { tags: null, answer: held?.answer ?? null };
}

/**
 * The snapshots of the saves that the chart shows. A snapshot that the
 * campaign list left out, such as of another branch, adds no tag switches.
 */
function useShownSnapshots(campaign: Eu4Campaign): SnapshotSelection {
  const ids = shownSelection(campaign.saves).ids.join("\n");
  return useMemo(() => ({ kind: "ids", ids: ids ? ids.split("\n") : [] }), [ids]);
}

function shownSelection(saves: readonly AnalysisSave[]) {
  return { kind: "ids" as const, ids: saves.flatMap((x) => (x.snapshot ? [x.snapshot.id] : [])) };
}

/** The countries of the filter, pinned so that opening another save keeps them. */
function useChartCountries(campaignId: string | null) {
  const filter = useTagFilter();
  const key = JSON.stringify(filter);
  const current = useCampaignView((state) =>
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
        if (!cancelled)
          useCampaignView.setState({ pinned: { campaignId, filter: key, countries } });
      });
    return () => {
      cancelled = true;
    };
  }, [current, campaignId, filter, key]);
  return current;
}

/** A generated tag that the chart leaves out, and the saves that say it was played. */
type LeftOutPlayed = { tag: string; saves: AnalysisSave[] };

function CampaignView({
  campaign,
  figure,
  data,
  error,
  chart,
  leftOutPlayed = [],
  loaded = true,
  csvTags,
  viewRow,
  mana,
  colorMode = "top",
  rivals,
}: {
  campaign: Eu4Campaign;
  figure: CampaignFigure;
  data: CampaignData;
  error: string | null;
  chart: ChartCountries | null;
  leftOutPlayed?: readonly LeftOutPlayed[];
  /** False while the values are still coming. */
  loaded?: boolean;
  /** The countries whose figures the CSV has. */
  csvTags: readonly CountryTag[];
  /** The color rule of the figure, the reader's or its own. */
  colorMode?: ColorMode;
  /** The rivals of the chart's countries, for the subject-and-rivals rule. */
  rivals?: { result: readonly LineageRivals[]; snapshotIds: readonly string[] } | null;
  /** The controls of the figure's view, under the chart row. */
  viewRow?: React.ReactNode;
  /** By country and Banked: the view, and the spend and split of each row by key. */
  mana?: {
    option: Exclude<ManaOption, "use">;
    view: ManaView;
    spent: Map<string, (number | null)[]> | null;
    uses: Map<string, (number[] | null)[]> | null;
    /** The chart's countries that no save carries mana for. */
    notCarried: readonly string[];
    hasResult: boolean;
    /** Something can still give figures: see `manaReading`. */
    reading: boolean;
  };
}) {
  const { playthroughId } = campaign;
  const { columns } = data;
  const world = !chart;
  const countries = useEu4Countries();
  const names = useMemo(() => new Map(countries.map((x) => [x.tag, x])), [countries]);
  const unclear = (data.unclear ?? []).map((tag) => tagNote(names, tag));
  const visualizationDispatch = useVisualizationDispatch();
  useEffect(() => {
    visualizationDispatch({
      type: "update-csv-data",
      getCsvData: () => everyFigureCsv(campaign, csvTags, names),
    });
  }, [campaign, csvTags, names, visualizationDispatch]);

  // Only saves with values can be selected. The latest one is selected at first.
  const selectedKey = useCampaignView((state) =>
    state.selected?.campaignId === playthroughId ? state.selected.saveKey : null,
  );
  const found = columns.findIndex((x) => x.save.key === selectedKey);
  const selected = found >= 0 ? found : columns.length - 1;
  const days = useMemo(() => columns.map((x) => dayNumber(x.date)), [columns]);
  const watchStart = useWatchStart(columns);
  const baseline = mana ? baselineOf(selected, watchStart) : null;
  const spacing = useMemo(() => saveSpacing(days), [days]);
  const zoom = useZoom(playthroughId);
  // A view that Mana sets on its own: Banked's opening window, By country's whole run. It
  // stays in this chart and never writes the shared zoom, so other figures keep the
  // player's; a zoom of the player's own replaces it.
  const [auto, setAuto] = useState<{ view: [number, number] | null } | null>(null);
  const view = auto ? auto.view : (zoom?.view ?? null);
  const fitted = !auto && !!zoom?.fitted && view !== null;
  // A selection that leaves the view, such as a step to another open save, shows every save again.
  const outOfView =
    !!view && selected >= 0 && (days[selected] < view[0] || days[selected] > view[1]);
  if (outOfView && auto) setAuto({ view: null });
  useEffect(() => {
    if (outOfView && !auto && playthroughId) setZoom(playthroughId, null, false);
  }, [outOfView, playthroughId, auto]);
  // Banked opens on the watched session, else the last ten years, and keeps to the newest
  // save while the game writes and the newest is selected.
  const option = mana?.option ?? null;
  const last = days.length ? days[days.length - 1] : null;
  const atEnd = selected === columns.length - 1;
  // The option and newest save last seen, whatever was selected then.
  const [seen, setSeen] = useState<{ option: string | null; last: number | null }>({
    option: null,
    last: null,
  });
  if (last !== null && (seen.option !== option || seen.last !== last)) {
    setSeen({ option, last });
    const from = watchStart >= 0 && watchStart < days.length - 1 ? days[watchStart] : last - 3653;
    const opening = { view: from > days[0] ? ([from, last] as [number, number]) : null };
    if (seen.option !== option)
      setAuto(option === "banked" ? opening : option === "country" ? { view: null } : null);
    // A new save seen with the newest selected moves an automatic window along.
    else if (option === "banked" && atEnd && auto) setAuto(opening);
  }
  /** The player's own zoom, which ends any automatic view. */
  const setPlayerZoom = (next: [number, number] | null, fit: boolean) => {
    if (!playthroughId) return;
    setAuto(null);
    setZoom(playthroughId, next, fit);
  };
  const select = (column: number) => {
    const save = columns[column];
    if (!save || !playthroughId) return;
    selectSave(playthroughId, save.save.key);
  };

  // Other players of a multiplayer campaign may be filtered out, so none is followed by default.
  const multiplayer = useEu4Meta().multiplayer;
  const rivalsByKey = useMemo(
    () =>
      rivals
        ? byKey(rivals.result, rivals.snapshotIds, columns, (x, i) => x.values[i] ?? null)
        : undefined,
    [rivals, columns],
  );
  // With the rivals rule, a country from outside the filter is a row only while it is a
  // rival of the followed country at the selected save; it is not ranked with the filter's.
  const focusState = useFocus(playthroughId);
  const followed = world ? null : subjectOf(focusState, data.rows, multiplayer);
  const rivalKeys = rivalRows(
    data.rows,
    followed ? rivalsByKey?.get(followed)?.[selected] : null,
    selected,
  );
  // The outside-filter rule first, so a dead former rival is neither a row nor a note.
  const { chartRows: drawn, added } = keepRivals(
    data.rows,
    chart?.tags ?? null,
    rivalKeys,
    followed,
  );
  // A country that spent nothing on the use is not a row; Not shown names it.
  const nothing = mana?.option === "country" ? spentNothing(drawn, followed) : [];
  const rows = nothing.length ? drawn.filter((row) => !nothing.includes(row)) : drawn;
  const model = useHistoryModel({
    playthroughId,
    rows,
    columns,
    names,
    world,
    selected,
    multiplayer,
    format: figure.format,
    fine: figure.fine,
    colorMode,
    rivalKeys: rivals ? rivalKeys : undefined,
    added,
  });
  const { subject, pins, pointed, compared, focus } = model;
  // The drawer closes on Escape from the document, so this listens on the window first,
  // while focus is in the chart.
  const scope = useRef<HTMLDivElement>(null);
  const escape = model.escape;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !scope.current?.contains(document.activeElement)) return;
      if (escape.current()) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [escape]);

  const openColumn = campaign.open
    ? columns.findIndex((x) => x.save.key === campaign.open!.save.key)
    : -1;
  const selectedSave = columns[selected];
  const { openSlot, changed } = useOpenSlot(campaign, selectedSave);

  // Until every known save is read, the axis marks each save: filled once read.
  const pending = useMemo(
    () =>
      campaign.saves.some((x) => x.status !== "ready")
        ? campaign.saves.map((x) => ({ day: dayNumber(x.date), status: x.status }))
        : null,
    [campaign.saves],
  );
  // The filter's countries, and the followed one's rivals now, that have no mana figures.
  const rivalsNow = new Set(followed ? (rivalsByKey?.get(followed)?.[selected] ?? []) : []);
  const filterTags = new Set(chart?.tags ?? []);
  // A rival with a tag the game gives to other countries later has no line on any figure.
  // One already left out of the chart by the filter is named there.
  const leftOut = new Set(chart?.leftOut ?? []);
  const generatedRivals = rivals
    ? [...rivalsNow].filter((tag) => isGeneratedTag(tag) && !leftOut.has(tag))
    : [];
  const missing = (mana?.notCarried ?? []).filter(
    (tag) => !isGeneratedTag(tag) && (filterTags.has(tag) || rivalsNow.has(tag)),
  );
  const rivalNotes = generatedRivals.length
    ? [
        {
          text: `${listText(generatedRivals.map((tag) => tagNote(names, tag)))} (${generatedRivals.length === 1 ? "rival" : "rivals"}): tag reused, not followed`,
          count: generatedRivals.length,
        },
      ]
    : [];
  const notes = [
    ...rivalNotes,
    ...(mana
      ? [
          ...(nothing.length
            ? [
                {
                  text: nothingText(
                    mana.view,
                    nothing.map((row) => nameAtLast(names, row)),
                  ),
                  count: nothing.length,
                },
              ]
            : []),
          ...(missing.length
            ? [
                {
                  text: notCarriedText(missing.map((tag) => nameOf(names, tag))),
                  count: missing.length,
                },
              ]
            : []),
        ]
      : []),
  ];
  if (!columns.length || selected < 0 || (mana && !rows.length)) {
    const empty =
      mana &&
      emptyText({
        reading: mana.reading,
        failed: !!error,
        hasResult: mana.hasResult,
        allSpentNothing: drawn.length > 0 && nothing.length === drawn.length,
        view: mana.view,
      });
    return (
      <div className="flex flex-col gap-3">
        <ChartRow />
        {viewRow}
        <Alert.Error msg={error} />
        {empty && <p className="text-sm text-gray-700 dark:text-gray-200">{empty}</p>}
        {pending && <PendingAxis pending={pending} />}
        <Foot
          campaign={campaign}
          chart={chart}
          unclear={unclear}
          leftOutPlayed={leftOutPlayed}
          notes={notes}
        />
      </div>
    );
  }

  const dateText = (column: number) => formatLongDate(columns[column].date);
  const standingRows = mana
    ? manaStandingRows(model.standingRows, rows, selected, baseline, mana)
    : model.standingRows;
  const sentence = world
    ? null
    : promptSentence({
        rows,
        names,
        subject,
        pointed,
        selected,
        hint: !!focus.subject && !compared && pins.length === 0,
      });
  // The axis spans every known save, read or not: "whole" and the clamps follow it.
  const axis = axisBounds(days, pending);
  const zoomTo = (wanted: [number, number] | null, fit = fitted) => {
    if (!playthroughId) return;
    const next = fitView(wanted, days, axis, spacing.median);
    setPlayerZoom(next, fit);
    // The selection stays in view.
    if (next && (days[selected] < next[0] || days[selected] > next[1])) {
      let best = -1;
      days.forEach((day, i) => {
        if (day < next![0] || day > next![1]) return;
        if (best < 0 || Math.abs(day - days[selected]) < Math.abs(days[best] - days[selected]))
          best = i;
      });
      if (best >= 0) select(best);
    }
  };
  const onZoom = (next: [number, number] | null) => zoomTo(next);
  const chips = view && (
    <span className="flex items-center gap-2 text-sm">
      <Button
        className="h-8 gap-1 px-2 py-0"
        aria-label={`Show the whole campaign; now ${yearOfDay(axis[0])} to ${yearOfDay(axis[1])} is cut to ${yearOfDay(view[0])} to ${yearOfDay(view[1])}`}
        onClick={() => zoomTo(null, false)}
      >
        {yearOfDay(view[0])}–{yearOfDay(view[1])}
        <XMarkIcon className="size-4" aria-hidden />
      </Button>
      <Button
        className="h-8 px-2 py-0"
        aria-pressed={fitted}
        title="Fitted scales the value axis to the saves in view; full keeps the scale of the whole campaign."
        onClick={() => setPlayerZoom(view, !fitted)}
      >
        Scale: {fitted ? "fitted" : "full"}
      </Button>
    </span>
  );
  const inView = (column: number) => !view || (days[column] >= view[0] && days[column] <= view[1]);
  const step = (by: number) => {
    let at = selected + by;
    while (at >= 0 && at < columns.length && !inView(at)) at += Math.sign(by);
    if (at >= 0 && at < columns.length) select(at);
  };
  const earlier = selected > 0 && inView(selected - 1) ? dateText(selected - 1) : null;
  const later =
    selected < columns.length - 1 && inView(selected + 1) ? dateText(selected + 1) : null;

  // A table of more than one value column has heads over its columns; the since head
  // names its baseline.
  const baseHead = baseline ? sinceHead(columns, baseline, watchStart) : null;
  const since =
    !mana || !baseHead ? null : mana.option === "banked" ? `spent ${baseHead}` : baseHead;
  const heads =
    mana && (since || (mana.option === "country" && mana.uses))
      ? {
          figure: mana.option === "banked" ? "banked" : "to date",
          ...(since && { since }),
          ...(mana.option === "country" && mana.uses && { split: "uses" }),
        }
      : null;
  return (
    <div ref={scope} className="flex flex-col gap-3">
      <ChartRow />
      {viewRow}
      <Alert.Error msg={error} />
      {changed}
      {chart && (
        <ChartCountriesNote chart={chart} count={drawn.length - added.size} loaded={loaded} />
      )}
      <div
        role="group"
        tabIndex={0}
        aria-label="Campaign chart. Left and right arrows select an earlier or a later save; plus and minus zoom; Escape lets go of pinned countries."
        className="@container rounded-md focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:outline-none"
        onKeyDown={(event) => {
          const key = event.key;
          if (key === "ArrowLeft" || key === "ArrowRight") step(key === "ArrowLeft" ? -1 : 1);
          else if (key === "Home" || key === "End") {
            const visible = columns.flatMap((_, i) => (inView(i) ? [i] : []));
            select(key === "Home" ? visible[0] : visible.at(-1)!);
          } else if (key === "+" || key === "=" || key === "-") {
            const whole = axis[1] - axis[0];
            const now = view ? view[1] - view[0] : whole;
            // Never narrower than a few of the campaign's own gaps between saves.
            const half = Math.max(spacing.median * 1.5, 1, (key === "-" ? now * 2 : now / 2) / 2);
            const from = Math.max(axis[0], days[selected] - half);
            const to = Math.min(axis[1], days[selected] + half);
            zoomTo(from <= axis[0] && to >= axis[1] ? null : [from, to]);
          } else if (key === "0") zoomTo(null, false);
          else return;
          event.preventDefault();
        }}
      >
        <HistoryHeader
          date={selectedSave.date}
          title={`${selectedSave.save.name} · ${sourceText(selectedSave.save)}`}
          earlier={earlier}
          later={later}
          onStep={step}
          sentence={sentence}
          openSlot={openSlot}
        />
        <HistoryChart
          days={days}
          session={mana && watchStart >= 0 ? days[watchStart] : null}
          lines={model.lines}
          rows={standingRows}
          values={model.standingValues}
          world={world}
          dots
          selected={selected}
          open={openColumn}
          view={view}
          fitted={fitted}
          sparse={spacing.sparse}
          long={spacing.long}
          subject={subject}
          pointed={pointed}
          comparison={model.comparison}
          format={figure.format}
          fine={figure.fine}
          tick={figure.tick}
          yearOf={yearOfDay}
          dateOf={dateOfDay}
          label={`${figure.title}, ${formatLongDate(selectedSave.date)}`}
          heads={heads}
          focusKey={model.focusKey ?? subject}
          focused={model.focusKey}
          onSelect={select}
          onPick={model.pick}
          onPoint={model.setPointerKey}
          onFocusRow={model.setFocusKey}
          onZoom={onZoom}
          pending={pending}
          axis={axis}
        />
      </div>
      {mana?.option === "country" && mana.uses && <UseLegend />}
      <p aria-live="polite" aria-atomic className="sr-only">
        Selected {formatLongDate(selectedSave.date)}, {selectedSave.save.name}
      </p>
      <Foot
        campaign={campaign}
        chart={chart}
        unclear={unclear}
        leftOutPlayed={leftOutPlayed}
        chips={chips}
        notes={notes}
      />
    </div>
  );
}

function yearOfDay(day: number) {
  return String(dateFromDayNumber(day).year);
}

function dateOfDay(day: number) {
  return formatLongDate(dateFromDayNumber(day));
}

/**
 * The header's line: only how to use the chart, never what the figures mean.
 * Pointing at a country offers to follow it; a followed country offers a comparison.
 */
function promptSentence({
  rows,
  names,
  subject,
  pointed,
  selected,
  hint,
}: {
  rows: readonly CampaignRow[];
  names: ReadonlyMap<string, CountryInfo>;
  subject: string | null;
  pointed: string | null;
  selected: number;
  /** The reader chose the followed country and compares none yet. */
  hint: boolean;
}) {
  const at = !rows.some((x) => x.key === subject) && rows.find((x) => x.key === pointed);
  if (at) {
    return (
      <>
        Click to follow{" "}
        <b className="font-semibold text-gray-900 dark:text-white">
          {nameNear(at, selected, names)}
        </b>
        .
      </>
    );
  }
  return hint ? <>Click another country to compare it; Escape lets go.</> : null;
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

/**
 * One band while reading runs, stopped or can't go on: a count and one
 * action. Local saves are read without a press; only uploads wait for one.
 */
function AnalysisBand({ campaign }: { campaign: Eu4Campaign }) {
  const { saves, progress, pause, waitingUploads, nav } = campaign;
  const bands = analysisBands({
    saves,
    identifying: nav?.pending ?? 0,
    reading: progress ? { downloading: !!progress.downloading } : null,
    pause,
    waitingUploads,
  });
  const actions: Record<Band["kind"], React.ReactNode> = {
    reading: <Button onClick={campaign.stop}>Stop reading</Button>,
    stopped: (
      <Button variant="primary" onClick={campaign.resume}>
        Resume
      </Button>
    ),
    lost: <Button onClick={campaign.readUploads}>Retry</Button>,
    uploads: (
      <Button variant="primary" onClick={campaign.readUploads}>
        Read uploads
      </Button>
    ),
    full: null,
  };
  return bands.map(({ kind, text }) => (
    <div
      key={kind}
      className="-mx-4 -mt-4 mb-1 flex min-h-12 items-center gap-3 border-b border-gray-200 px-4 py-2 text-sm dark:border-slate-700"
    >
      <span role="status" className="grow">
        {text}
      </span>
      {actions[kind]}
    </div>
  ));
}

/** The saves on the axis before any is read: hollow until read, red when a read failed. */
function PendingAxis({ pending }: { pending: readonly PendingSave[] }) {
  const first = Math.min(...pending.map((x) => x.day));
  const last = Math.max(...pending.map((x) => x.day), first + 1);
  return (
    <div className="relative mx-6 mt-6 h-10 border-t border-gray-300 dark:border-slate-600">
      {byStatus(pending).map((x, i) => (
        <span
          key={i}
          className="absolute top-0 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${((x.day - first) / (last - first)) * 100}%` }}
        >
          <PendingMark status={x.status} />
        </span>
      ))}
    </div>
  );
}

/** "the 1691, 1723 and 1761 saves", by date where two saves share a year. */
function yearsText(saves: readonly AnalysisSave[], all: readonly AnalysisSave[]) {
  const labels = saves.map((x) =>
    all.some((y) => y !== x && y.date.year === x.date.year)
      ? formatLongDate(x.date)
      : String(x.date.year),
  );
  const list =
    labels.length <= 1 ? labels.join("") : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
  return `the ${list} ${saves.length === 1 ? "save" : "saves"}`;
}

/** Add saves, and what the chart leaves out, folded into one line. */
function Foot({
  campaign,
  chart,
  unclear,
  leftOutPlayed,
  chips,
  notes = [],
}: {
  campaign: Eu4Campaign;
  /** Countries that the chart leaves out, and why, with how many. */
  notes?: readonly { text: string; count: number }[];
  chart: ChartCountries | null;
  /** The zoom's chips, beside Add saves. */
  chips?: React.ReactNode;
  /** The names of the tags whose holders cannot be told apart. */
  unclear: readonly string[];
  leftOutPlayed: readonly LeftOutPlayed[];
}) {
  const { saves, issues, nav } = campaign;
  const missing = useEu4History((state) =>
    state.stored?.campaignId === campaign.playthroughId ? state.stored.missing : 0,
  );
  const unreadable = saves.filter((x) => x.status === "failed" && !x.retry);
  // Saves of a date that the chart already shows: in multiplayer, often each player's copy.
  const sameDate = new Map<string, { kept: string; others: string[] }>();
  const leftOut = [...(nav?.leftOut ?? [])].sort(
    (a, b) => dayNumber(a.save.date) - dayNumber(b.save.date),
  );
  for (const { save, kept } of leftOut) {
    const date = formatLongDate(save.date);
    const entry = sameDate.get(date) ?? { kept: kept.name, others: [] };
    entry.others.push(save.name);
    sameDate.set(date, entry);
  }
  const sameDateCount = nav?.leftOut.length ?? 0;
  const saveEntries = [
    ...unreadable.map((x) => `${x.save.name}: can't be read`),
    // A notice names a save that analysis left out, such as one of another campaign.
    ...issues.filter((issue) => !unreadable.some((x) => issue.startsWith(`${x.save.name}:`))),
  ];
  const dateEntries = [...sameDate].map(
    ([date, { kept, others }]) => `${date}: ${others.join(", ")} (shows ${kept})`,
  );
  // The open save may give a generated tag to another country than the one played, so only its kind is named.
  const kindOf = (tag: string) =>
    ({
      C: "a colonial nation",
      E: "an estate country",
      F: "a federation",
      K: "a client state",
      T: "a trade company",
    })[tag[0]] ?? "a generated country";
  const playedTags = new Set(leftOutPlayed.map((x) => x.tag));
  const tags = (chart?.leftOut ?? []).filter((tag) => !playedTags.has(tag));
  const entries = [
    ...saveEntries,
    ...dateEntries,
    ...leftOutPlayed.map(
      ({ tag, saves: played }) =>
        `${tag} (${kindOf(tag)}, played in ${yearsText(played, campaign.saves)}): tag reused, not followed`,
    ),
    ...(tags.length ? [`${tags.join(", ")}: tags reused, not followed`] : []),
    ...(unclear.length ? [`${unclear.join(", ")}: holders can't be told apart`] : []),
    ...notes.map((note) => note.text),
    ...(nav?.truncated ? ["Only the latest 200 uploads are listed."] : []),
    ...(missing
      ? [`${plural(missing, "save", "saves")} saved in this browser: can't be read`]
      : []),
  ];
  const countryCount =
    tags.length + leftOutPlayed.length + unclear.length + notes.reduce((n, x) => n + x.count, 0);
  const parts = [
    saveEntries.length + missing > 0 && plural(saveEntries.length + missing, "save", "saves"),
    sameDateCount > 0 && `${plural(sameDateCount, "more save", "more saves")} of shown dates`,
    countryCount > 0 && plural(countryCount, "country", "countries"),
  ].filter(Boolean);
  return (
    <Collapsible className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
      <span className="flex items-center gap-4">
        <span className="flex items-center">
          <AddSaves quiet />
          {/* Without file handles, a save the game writes comes in only by a drop. */}
          {!canWatchFiles() && <span>, or drop them on the page.</span>}
        </span>
        <KeptLine playthroughId={campaign.playthroughId} />
        {chips}
      </span>
      {entries.length > 0 && (
        <>
          <Collapsible.Trigger className="w-auto! gap-1.5 font-normal text-gray-600 dark:text-gray-300">
            Not shown{parts.length ? `: ${parts.join(", ")}` : ""}
          </Collapsible.Trigger>
          <Collapsible.Content className="basis-full">
            <ul className="mt-1 list-disc pl-5 text-gray-600 dark:text-gray-300">
              {entries.map((entry, i) => (
                <li key={i}>{entry}</li>
              ))}
            </ul>
          </Collapsible.Content>
        </>
      )}
    </Collapsible>
  );
}

/** Where the campaign's points are kept, and Forget. */
function KeptLine({ playthroughId }: { playthroughId: string | null }) {
  const stored = useEu4History((state) =>
    state.stored?.campaignId === playthroughId ? state.stored : null,
  );
  const [confirm, setConfirm] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const footer = storeFooter(stored);
  if (!stored || !footer || !playthroughId) return null;
  const { unreadable } = footer;
  const forget = (
    <Dialog open={confirm} onOpenChange={setConfirm}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" shape="none" className="underline underline-offset-2">
          Forget
        </Button>
      </Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Title>Forget this campaign in this browser?</Dialog.Title>
        <Dialog.Description>
          {unreadable
            ? "Its saved figures can't be read, and are deleted from this browser. Saves open in this tab are saved again."
            : `The figures of ${plural(stored.kept, "save", "saves")}. Saves open in this tab are saved again.`}
        </Dialog.Description>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button>Cancel</Button>
          </Dialog.Close>
          <Button
            variant="danger"
            disabled={forgetting}
            onClick={async () => {
              setForgetting(true);
              try {
                await forgetCampaign(useEu4History, eu4Analysis, playthroughId);
                setConfirm(false);
              } finally {
                setForgetting(false);
              }
            }}
          >
            Forget all
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
  return (
    <span className="flex items-center gap-1 text-gray-600 dark:text-gray-300">
      {keptText(footer)}
      {footer.forget && <span aria-hidden>·</span>}
      {footer.forget && forget}
    </span>
  );
}

/**
 * The data to draw: the last that came while the query asks again, such as
 * for countries a rival adds, so the chart does not blank in between.
 */
function useHeld<T>(value: T, answered: boolean, figure: string): T {
  const [last, setLast] = useState<{ figure: string; value: T } | null>(null);
  if (answered && (last?.value !== value || last.figure !== figure)) setLast({ figure, value });
  // Only the same figure's last value stands in; another figure's would mislabel it.
  return answered || last?.figure !== figure ? value : last.value;
}

/** A row's name by the last tag it held in the chart. */
const nameAtLast = (names: ReadonlyMap<string, CountryInfo>, row: CampaignRow) =>
  nameOf(names, row.cells.findLast((x) => x)?.tag ?? row.key);

/** What the split bars' colors mean, in stack order. */
function UseLegend() {
  const useColor = manaUseColors(isDarkMode());
  return (
    <p className="flex flex-wrap justify-end gap-x-3 text-xs text-gray-600 dark:text-gray-300">
      <span>Uses of all mana:</span>
      {MANA_USES.map((use) => (
        <span key={use} className="flex items-center gap-1" title={useFullName[use]}>
          <span
            aria-hidden
            className="inline-block size-2.5 rounded-sm"
            style={{ background: useColor[use] }}
          />
          {useName[use]}
        </span>
      ))}
    </p>
  );
}

type ManaRows = NonNullable<Parameters<typeof CampaignView>[0]["mana"]>;

/** By country and Banked rows: the since column, and By country's split of all its mana. */
function manaStandingRows(
  standings: ReturnType<typeof useHistoryModel>["standingRows"],
  rows: readonly CampaignRow[],
  selected: number,
  baseline: Baseline | null,
  mana: ManaRows,
) {
  // Every row's bar has the same colors, looked up once.
  const palette = manaUseColors(isDarkMode());
  const colors = MANA_USES.map((x) => palette[x]);
  return standings.map((standing) => {
    const row = rows.find((x) => x.key === standing.key);
    const series =
      mana.option === "banked"
        ? (mana.spent?.get(standing.key) ?? [])
        : (row?.cells.map((cell) => valueOf(cell)) ?? []);
    const now = series[selected] ?? null;
    const before = baseline ? (series[baseline.column] ?? null) : null;
    const since = !baseline
      ? undefined
      : standing.gone || now === null || before === null
        ? ""
        : mana.option === "banked"
          ? formatInt(now - before)
          : signed(now - before);
    const uses = mana.option === "country" ? mana.uses?.get(standing.key)?.[selected] : null;
    return {
      ...standing,
      since,
      split:
        uses && !standing.gone
          ? {
              shares: shares(uses),
              colors,
              labels: MANA_USES.map((x) => useFullName[x]),
            }
          : undefined,
    };
  });
}
