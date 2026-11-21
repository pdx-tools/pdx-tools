import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { useVisualizationDispatch } from "@/components/viz";
import { useAnalysisQuery } from "@/features/campaign/analysis/useAnalysisQuery";
import type { SnapshotSelection } from "@/features/campaign/analysis/session";
import { useAddCampaignSaves } from "@/features/campaign/useAddCampaignSaves";
import type { CampaignSaveFiles } from "@/features/campaign/useAddCampaignSaves";
import { openCampaignSave } from "@/features/campaign/openSave";
import { currentSaveInput } from "@/features/engine";
import { dateFromDayNumber, dayNumber, formatLongDate } from "@/features/timeline/date";
import { cx } from "class-variance-authority";
import { eu4Analysis } from "@/features/eu4/analysis/analysisClient";
import { useEu4History } from "@/features/eu4/analysis/store";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";
import { useEu4Actions, useEu4Countries, useEu4Meta, useTagFilter } from "@/features/eu4/store";
import { getEu4Worker } from "@/features/eu4/worker/getEu4Worker";
import type { ChartCountries, CountryMetric } from "@/wasm/wasm_eu4";
import { Badge } from "@/components/Badge";
import { Collapsible } from "@/components/Collapsible";
import XMarkIcon from "@heroicons/react/16/solid/XMarkIcon";
import { bySaveFigures } from "./figures";
import type { BySaveFigure, BySaveViz } from "./figures";
import { orderSince, saveSpacing, valueOf } from "./history";
import type { standingsAt } from "./history";
import { HistoryChart } from "./HistoryChart";
import { HistoryHeader } from "./HistoryHeader";
import { alignColumns, bySaveCsv, lineageRows, sourceText, unclearTags } from "./model";
import type { BySaveData, BySaveRow, CountryInfo } from "./model";
import { useEu4Campaign } from "./useEu4Campaign";
import { nameOf, useHistoryModel } from "./useHistoryModel";
import { selectSave, setZoom, useBySaveView, useZoom } from "./view";
import type { Eu4Campaign } from "./useEu4Campaign";

const EU4_SAVES: CampaignSaveFiles = {
  pattern: /\.eu4$/i,
  accept: ".eu4",
  picker: { description: "EU4 saves", accept: { "application/pdx": [".eu4"] } },
};

/** The most countries that a filter gives a chart. */
const COUNTRY_LIMIT = 20;

/** One value for each analyzed save of the campaign, as a chart and standings. */
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
const PLAYED_COUNTRIES = { kind: "playedCountries" } as const;

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
  const shown = useShownSnapshots(campaign);
  const { result, snapshotIds, error } = useAnalysisQuery(
    eu4Analysis,
    useEu4History,
    campaign.playthroughId,
    query,
    shown,
  );
  // Which saves played the generated tags that the chart leaves out.
  const played = useAnalysisQuery(
    eu4Analysis,
    useEu4History,
    campaign.playthroughId,
    chart?.leftOut.length ? PLAYED_COUNTRIES : null,
    shown,
  );
  const data = useMemo((): BySaveData => {
    const { columns, at } = alignColumns(snapshotIds, campaign.saves);
    return {
      columns,
      rows: result ? lineageRows(result, at) : [],
      unclear: result ? unclearTags(result) : [],
    };
  }, [result, snapshotIds, campaign.saves]);
  const leftOutPlayed = useMemo(() => {
    if (!chart || !played.result) return [];
    const { columns, at } = alignColumns(played.snapshotIds, campaign.saves);
    return chart.leftOut.flatMap((tag) => {
      const saves = at.flatMap((i, k) => (played.result![i]?.includes(tag) ? [columns[k]] : []));
      return saves.length ? [{ tag, saves }] : [];
    });
  }, [chart, played.result, played.snapshotIds, campaign.saves]);
  return (
    <BySaveView
      campaign={campaign}
      figure={figure}
      data={data}
      error={error}
      chart={chart}
      leftOutPlayed={leftOutPlayed}
      loaded={!!result && data.columns.length > 0}
    />
  );
}

/**
 * The snapshots of the saves that the chart shows. A snapshot that the
 * campaign list left out, such as of another branch, adds no tag switches.
 */
function useShownSnapshots(campaign: Eu4Campaign): SnapshotSelection {
  const ids = campaign.saves.flatMap((x) => (x.snapshot ? [x.snapshot.id] : [])).join("\n");
  return useMemo(() => ({ kind: "ids", ids: ids ? ids.split("\n") : [] }), [ids]);
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

/** A generated tag that the chart leaves out, and the saves that say it was played. */
type LeftOutPlayed = { tag: string; saves: AnalysisSave[] };

function BySaveView({
  campaign,
  figure,
  data,
  error,
  chart,
  leftOutPlayed = [],
  loaded = true,
}: {
  campaign: Eu4Campaign;
  figure: BySaveFigure;
  data: BySaveData;
  error: string | null;
  chart: ChartCountries | null;
  leftOutPlayed?: readonly LeftOutPlayed[];
  /** False while the values are still coming. */
  loaded?: boolean;
}) {
  const { nav, playthroughId } = campaign;
  const { columns, rows } = data;
  const world = !chart;
  const countries = useEu4Countries();
  const names = useMemo(() => new Map(countries.map((x) => [x.tag, x])), [countries]);
  const unclear = (data.unclear ?? []).map((tag) => {
    const name = names.get(tag)?.name;
    return name ? `${name} (${tag})` : tag;
  });
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
  const days = useMemo(() => columns.map((x) => dayNumber(x.date)), [columns]);
  const spacing = useMemo(() => saveSpacing(days), [days]);
  const zoom = useZoom(playthroughId);
  const view = zoom?.view ?? null;
  const fitted = !!zoom?.fitted && view !== null;
  // A selection that leaves the view, such as a step to another open save, shows every save again.
  const outOfView =
    !!view && selected >= 0 && (days[selected] < view[0] || days[selected] > view[1]);
  useEffect(() => {
    if (outOfView && playthroughId) setZoom(playthroughId, null, false);
  }, [outOfView, playthroughId]);
  const select = (column: number) => {
    const save = columns[column];
    if (!save || !playthroughId) return;
    selectSave(playthroughId, save.save.key);
  };

  // Other players of a multiplayer campaign may be filtered out, so none is followed by default.
  const multiplayer = useEu4Meta().multiplayer;
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
  // The file name of a save that changed after analysis read it.
  const [changed, setChanged] = useState<string | null>(null);
  const selectedSave = columns[selected];
  // The open save and any step now, for a check that ends after a render.
  const now = useRef({ openKey, stepping: nav?.opening ?? null });
  useLayoutEffect(() => {
    now.current = { openKey, stepping: nav?.opening ?? null };
  });
  const openSelected = async () => {
    if (!nav || !selectedSave || !playthroughId) return;
    selectSave(playthroughId, selectedSave.save.key);
    setOpening(true);
    setChanged(null);
    try {
      // The dot is of the bytes that analysis read, so other bytes do not open as its save.
      const address = window.location.href;
      const input = currentSaveInput();
      const { openKey: before } = now.current;
      if (await campaign.fileChanged(selectedSave)) setChanged(selectedSave.save.name);
      // The player can leave the page or open or drop another save while the file is read.
      else if (
        window.location.href === address &&
        currentSaveInput() === input &&
        now.current.openKey === before &&
        now.current.stepping === null
      )
        await openCampaignSave(nav, selectedSave.save);
    } finally {
      setOpening(false);
    }
  };

  if (!columns.length || selected < 0) {
    return (
      <div className="flex flex-col gap-3">
        <StatusLine campaign={campaign} />
        <Alert.Error msg={error} />
        <Foot campaign={campaign} chart={chart} unclear={unclear} leftOutPlayed={leftOutPlayed} />
      </div>
    );
  }

  const dateText = (column: number) => formatLongDate(columns[column].date);
  const sentence = world
    ? null
    : sentenceFor({
        rows,
        names,
        subject,
        compared,
        pointed,
        selected,
        columns,
        standings: model.standings,
        figure,
        long: spacing.long,
        days,
        hint: !!focus.subject && !compared && pins.length === 0,
      });
  const openSlot =
    campaign.open && selectedSave.save.key === campaign.open.save.key ? (
      <Badge role="status" className="h-[34px] justify-center rounded-md px-3 text-sm font-medium">
        Open now
      </Badge>
    ) : selectedSave.save.isOpen ? (
      campaign.openOtherVersion && (
        <Badge
          title="The viewer shows another version of this file."
          className="h-[34px] justify-center rounded-md px-3 text-sm font-medium"
        >
          Other version
        </Badge>
      )
    ) : (
      <Button
        className="h-[34px] px-3 py-0 text-sm whitespace-nowrap"
        disabled={!nav || opening || nav.opening !== null}
        onClick={() => void openSelected()}
      >
        {opening ? "Opening" : "Open save"}
      </Button>
    );
  const zoomTo = (wanted: [number, number] | null, fit = fitted) => {
    if (!playthroughId) return;
    // A view holds at least one save: one that falls between saves widens to the nearest.
    let next = wanted;
    if (next && !days.some((day) => day >= next![0] && day <= next![1])) {
      const middle = (next[0] + next[1]) / 2;
      const near = days.reduce((a, b) => (Math.abs(b - middle) < Math.abs(a - middle) ? b : a));
      next = [Math.min(next[0], near), Math.max(next[1], near)];
    }
    // A view is never narrower than the campaign's typical gap between saves.
    if (next) {
      const least = Math.max(spacing.median, 30);
      if (next[1] - next[0] < least) {
        // Widened about its middle, then moved back inside the campaign.
        const middle = (next[0] + next[1]) / 2;
        const from = Math.max(days[0], Math.min(days.at(-1)! - least, middle - least / 2));
        next = [Math.round(from), Math.round(from + least)];
      }
    }
    if (next && next[0] <= days[0] && next[1] >= days.at(-1)!) next = null;
    setZoom(playthroughId, next, fit);
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
        aria-label={`Show the whole campaign; now ${columns[0].date.year} to ${columns.at(-1)!.date.year} is cut to ${yearOfDay(view[0])} to ${yearOfDay(view[1])}`}
        onClick={() => zoomTo(null, false)}
      >
        {yearOfDay(view[0])}–{yearOfDay(view[1])}
        <XMarkIcon className="size-4" aria-hidden />
      </Button>
      <Button
        className="h-8 px-2 py-0"
        aria-pressed={fitted}
        onClick={() => playthroughId && setZoom(playthroughId, view, !fitted)}
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

  return (
    <div ref={scope} className="flex flex-col gap-3">
      <StatusLine campaign={campaign} />
      <Alert.Error msg={error} />
      {changed && (
        <Alert variant="info">
          <Alert.Description className="px-3 py-2">
            {changed} changed after it was read, so it did not open. It is read again.
          </Alert.Description>
        </Alert>
      )}
      {chart && <ChartCountriesNote chart={chart} count={rows.length} loaded={loaded} />}
      <div
        role="group"
        tabIndex={0}
        aria-label="Campaign chart. Left and right arrows select an earlier or a later save; plus and minus zoom; Escape lets go of pinned countries."
        className="rounded-md focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:outline-none"
        onKeyDown={(event) => {
          const key = event.key;
          if (key === "ArrowLeft" || key === "ArrowRight") step(key === "ArrowLeft" ? -1 : 1);
          else if (key === "Home" || key === "End") {
            const visible = columns.flatMap((_, i) => (inView(i) ? [i] : []));
            select(key === "Home" ? visible[0] : visible.at(-1)!);
          } else if (key === "+" || key === "=" || key === "-") {
            const whole = days.at(-1)! - days[0];
            const now = view ? view[1] - view[0] : whole;
            // Never narrower than a few of the campaign's own gaps between saves.
            const half = Math.max(spacing.median * 1.5, 1, (key === "-" ? now * 2 : now / 2) / 2);
            const from = Math.max(days[0], days[selected] - half);
            const to = Math.min(days.at(-1)!, days[selected] + half);
            zoomTo(from <= days[0] && to >= days.at(-1)! ? null : [from, to]);
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
          lines={model.lines}
          rows={model.standingRows}
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
          focusKey={model.focusKey ?? subject}
          onSelect={select}
          onPick={model.pick}
          onPoint={model.setPointerKey}
          onFocusRow={model.setFocusKey}
          onZoom={onZoom}
        />
      </div>
      <p aria-live="polite" aria-atomic className="sr-only">
        Selected {formatLongDate(selectedSave.date)}, {selectedSave.save.name}
      </p>
      <Foot
        campaign={campaign}
        chart={chart}
        unclear={unclear}
        leftOutPlayed={leftOutPlayed}
        chips={chips}
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

/** The one sentence of the header: how the subject and the compared country have stood. */
function sentenceFor({
  rows,
  names,
  subject,
  compared,
  pointed,
  selected,
  columns,
  standings,
  figure,
  long,
  days,
  hint,
}: {
  rows: readonly BySaveRow[];
  names: ReadonlyMap<string, CountryInfo>;
  subject: string | null;
  compared: string | null;
  pointed: string | null;
  selected: number;
  columns: readonly AnalysisSave[];
  standings: ReturnType<typeof standingsAt<BySaveRow>>;
  long: (gap: number) => boolean;
  days: readonly number[];
  /** The reader chose the followed country and compares none yet. */
  hint: boolean;
  figure: BySaveFigure;
}) {
  const row = (key: string | null) => rows.find((x) => x.key === key);
  // A country without a cell at the save is named by its nearest earlier tag, else its next.
  const nameAt = (x: BySaveRow) => {
    const cell =
      x.cells[selected] ??
      x.cells.slice(0, selected).findLast((c) => c !== null) ??
      x.cells.slice(selected + 1).find((c) => c !== null);
    return nameOf(names, cell?.tag ?? "");
  };
  const b = (text: string) => <b className="font-semibold text-gray-900 dark:text-white">{text}</b>;
  const me = row(subject);
  if (!me) {
    const at = row(pointed);
    return at ? <>Click to follow {b(nameAt(at))}.</> : null;
  }
  const rival = row(compared);
  if (rival) {
    const order = orderSince(me.cells, rival.cells, selected);
    if (!order)
      return (
        <>
          {b(nameAt(valueOf(me.cells[selected]) === null ? me : rival))} has no figure in this save.
        </>
      );
    const at = columns[order.since].date;
    // A year that another save shares is not enough to name the save.
    const year = columns.some((x, i) => i !== order.since && x.date.year === at.year)
      ? formatLongDate(at)
      : String(at.year);
    // Where the order began after a long, dotted join, it is known only by that save.
    const unmeasured =
      !order.whole && order.since > 0 && long(days[order.since] - days[order.since - 1]);
    const start = unmeasured ? `by the ${year} save` : `since the ${year} save`;
    // Before the latest save, the run may end later, so the sentence ends at the selected save.
    const later = selected < columns.length - 1;
    if (later) {
      const span =
        order.since === selected
          ? "in this save"
          : unmeasured
            ? `by the ${year} save and up to this one`
            : `from the ${year} save to this one`;
      if (order.sign === 0)
        return (
          <>
            {b(nameAt(me))} and {b(nameAt(rival))} were level {span}.
          </>
        );
      const [ahead, behind] = order.sign > 0 ? [me, rival] : [rival, me];
      return (
        <>
          {b(nameAt(ahead))} was ahead of {b(nameAt(behind))} {span}.
        </>
      );
    }
    const when = order.whole ? `in every save since ${year}` : start;
    if (order.sign === 0)
      return (
        <>
          {b(nameAt(me))} and {b(nameAt(rival))} have been level {when}.
        </>
      );
    const [ahead, behind] = order.sign > 0 ? [me, rival] : [rival, me];
    return (
      <>
        {b(nameAt(ahead))} has been ahead of {b(nameAt(behind))} {when}.
      </>
    );
  }
  if (hint) return <>Click another country to compare it; Escape lets go.</>;
  const mine = standings.find((x) => x.row === me);
  if (mine?.tied) {
    const level = standings.filter((x) => x !== mine && x.value === mine.value);
    return (
      <>
        {b(nameAt(me))} and {level.map((x) => nameAt(x.row)).join(" and ")} are level at{" "}
        {figure.format(mine.value)}.
      </>
    );
  }
  return null;
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
}: {
  campaign: Eu4Campaign;
  chart: ChartCountries | null;
  /** The zoom's chips, beside Add saves. */
  chips?: React.ReactNode;
  /** The names of the tags whose holders cannot be told apart. */
  unclear: readonly string[];
  leftOutPlayed: readonly LeftOutPlayed[];
}) {
  const { saves, issues, nav } = campaign;
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
    ...unreadable.map((x) => `${x.save.name}: could not be read.`),
    // A notice names a save that analysis left out, such as one of another campaign.
    ...issues.filter((issue) => !unreadable.some((x) => issue.startsWith(`${x.save.name}:`))),
  ];
  const dateEntries = [...sameDate].map(
    ([date, { kept, others }]) =>
      `${date}: ${plural(others.length, "more save", "more saves")} of this date (${others.join(", ")}); the chart shows ${kept}.`,
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
        `${tag}, ${kindOf(tag)}, is marked as played in ${yearsText(played, campaign.saves)}: the game gives this tag to other countries later, so it is not followed from save to save.`,
    ),
    ...(tags.length
      ? [`${tags.join(", ")}: the game gives these tags to other countries later.`]
      : []),
    ...(unclear.length
      ? [
          `${unclear.join(", ")}: more than one country held this tag in a way the saves do not separate, so whose values are whose cannot be told.`,
        ]
      : []),
    ...(nav?.truncated ? ["Only the latest 200 uploads are listed."] : []),
  ];
  const countryCount = tags.length + leftOutPlayed.length + unclear.length;
  const parts = [
    saveEntries.length > 0 && plural(saveEntries.length, "save", "saves"),
    sameDateCount > 0 && `${plural(sameDateCount, "more save", "more saves")} of shown dates`,
    countryCount > 0 && plural(countryCount, "country", "countries"),
  ].filter(Boolean);
  return (
    <Collapsible className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
      <span className="flex items-center gap-4">
        <AddSaves quiet />
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

/** Add saves: a bordered button where it is the one action, a quiet one in the foot. */
function AddSaves({ quiet = false }: { quiet?: boolean }) {
  const { busy, chooseFiles, fileInput } = useAddCampaignSaves(EU4_SAVES, (issue) =>
    useEu4History.setState({ issues: [issue] }),
  );
  return (
    <>
      <Button
        className={cx("self-start", quiet && "underline underline-offset-2")}
        {...(quiet && { variant: "ghost", shape: "none" })}
        disabled={busy}
        onClick={() => void chooseFiles()}
      >
        Add saves
      </Button>
      <input {...fileInput} tabIndex={-1} aria-label="Add campaign saves" className="sr-only" />
    </>
  );
}
