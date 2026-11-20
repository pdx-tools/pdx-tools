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
import { MONTH_ABBR, formatLongDate } from "@/features/timeline/date";
import { MONTH_DAY_SIZERS } from "@/features/timeline/TimelineReadout";
import { cx } from "class-variance-authority";
import { eu4Analysis } from "@/features/eu4/analysis/analysisClient";
import { useEu4History } from "@/features/eu4/analysis/store";
import type { AnalysisSave } from "@/features/eu4/analysis/campaignSaves";
import { useEu4Actions, useEu4Countries, useTagFilter } from "@/features/eu4/store";
import { getEu4Worker } from "@/features/eu4/worker/getEu4Worker";
import type { ChartCountries, CountryMetric } from "@/wasm/wasm_eu4";
import ChevronLeftIcon from "@heroicons/react/20/solid/ChevronLeftIcon";
import ChevronRightIcon from "@heroicons/react/20/solid/ChevronRightIcon";
import { Badge } from "@/components/Badge";
import { Collapsible } from "@/components/Collapsible";
import { IconButton } from "@/components/IconButton";
import { BySaveLedger, NotAtThisSave, useSettled } from "./BySaveLedger";
import { bySaveFigures } from "./figures";
import type { BySaveFigure, BySaveViz } from "./figures";
import { alignColumns, bySaveCsv, lineageRows, rowsAt, sourceText, unclearTags } from "./model";
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
  const { result, snapshotIds, error } = useAnalysisQuery(
    eu4Analysis,
    useEu4History,
    campaign.playthroughId,
    query,
    useShownSnapshots(campaign),
  );
  const data = useMemo((): BySaveData => {
    const { columns, at } = alignColumns(snapshotIds, campaign.saves);
    return {
      columns,
      rows: result ? lineageRows(result, at) : [],
      unclear: result ? unclearTags(result) : [],
    };
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
  // The snapshot under the pointer, so a column that goes or a file that is read again ends the hover.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const select = (column: number) => {
    const save = columns[column];
    if (!save || !playthroughId) return;
    // A step ends the hover, so the heading and values show the selection.
    setHoveredId(null);
    // A focused country without a value there leaves the list, and its emphasis with it.
    if (focusEmphasis && !rows.find((row) => row.key === focusEmphasis)?.cells[column])
      setFocusEmphasis(null);
    selectSave(playthroughId, save.save.key);
  };
  const hoveredAt = columns.findIndex((x) => x.snapshot?.id === hoveredId);
  const hovered = hoveredAt >= 0 ? hoveredAt : null;
  const shown = hovered ?? selected;
  const group = useRef<HTMLDivElement>(null);
  // The pointer's emphasis wins while it lasts; keyboard focus keeps its own.
  const [pointerEmphasis, setPointerEmphasis] = useState<string | null>(null);
  const [focusEmphasis, setFocusEmphasis] = useState<string | null>(null);
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

  // Rows stand in the order of the selected save once stepping stops, so a
  // held arrow key does not shuffle them. Hover never moves them. A country
  // without a value there joins the end only while it has one.
  const settledKey = useSettled(columns[selected]?.save.key ?? null, 350);
  const settledAt = columns.findIndex((x) => x.save.key === settledKey);
  const orderAt = settledAt >= 0 ? settledAt : selected;
  const order = useMemo(() => (orderAt >= 0 ? rowsAt(rows, orderAt) : []), [rows, orderAt]);
  const present = useMemo(
    () => [...order, ...rows.filter((row) => !order.includes(row) && row.cells[selected] !== null)],
    [order, rows, selected],
  );
  const absent = useMemo(
    () => (selected >= 0 ? rows.filter((row) => row.cells[selected] === null) : []),
    [rows, selected],
  );
  const shownRows =
    hovered === null
      ? present.filter((row) => row.cells[selected] !== null)
      : [
          ...present,
          ...absent.filter((row) => row.cells[hovered] !== null && !present.includes(row)),
        ];
  // A focused row that a step removes hands focus to the chart, so the arrows keep stepping.
  const focusedGone = focusEmphasis !== null && !shownRows.some((row) => row.key === focusEmphasis);
  useEffect(() => {
    if (focusedGone && !group.current?.contains(document.activeElement)) group.current?.focus();
  }, [focusedGone]);

  if (!columns.length || selected < 0) {
    return (
      <div className="flex flex-col gap-3">
        <StatusLine campaign={campaign} />
        <Alert.Error msg={error} />
        <Foot campaign={campaign} chart={chart} unclear={unclear} />
      </div>
    );
  }
  const shownSave = columns[shown];
  const world = !chart;
  const preview = hovered !== null && hovered !== selected;
  const dateText = (column: number) => formatLongDate(columns[column].date);
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
  const header = (
    <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2 py-1">
      <span
        className={cx("flex items-baseline gap-2.5 whitespace-nowrap", preview && "opacity-60")}
        title={`${shownSave.save.name} · ${sourceText(shownSave.save)}`}
      >
        <span className="text-[44px] leading-[44px] font-semibold tracking-tight tabular-nums">
          {shownSave.date.year}
        </span>
        <span className="inline-grid text-xl text-gray-600 dark:text-gray-300">
          {MONTH_DAY_SIZERS}
          <span className="col-start-1 row-start-1">
            {MONTH_ABBR[shownSave.date.month]} {shownSave.date.day}
          </span>
        </span>
      </span>
      <span className="flex">
        <IconButton
          shape="square"
          className="rounded-r-none"
          icon={<ChevronLeftIcon className="size-4" aria-hidden />}
          disabled={selected <= 0}
          aria-label={selected > 0 ? `Earlier save, ${dateText(selected - 1)}` : "Earlier save"}
          // A tooltip at the ends too, so the button keeps its focus.
          tooltip={selected > 0 ? `Earlier save: ${dateText(selected - 1)}` : "The earliest save"}
          onClick={() => select(selected - 1)}
        />
        <IconButton
          shape="square"
          className="-ml-px rounded-l-none"
          icon={<ChevronRightIcon className="size-4" aria-hidden />}
          disabled={selected >= columns.length - 1}
          aria-label={
            selected < columns.length - 1 ? `Later save, ${dateText(selected + 1)}` : "Later save"
          }
          tooltip={
            selected < columns.length - 1
              ? `Later save: ${dateText(selected + 1)}`
              : "The latest save"
          }
          onClick={() => select(selected + 1)}
        />
      </span>
      {/* The slot acts on the selected save only, so it dims while the pointer shows another. */}
      <span
        className={cx("ml-auto flex w-28 justify-end transition-opacity", preview && "opacity-40")}
      >
        {openSlot}
      </span>
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
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
        ref={group}
        role="group"
        tabIndex={0}
        aria-label="Campaign chart. Left and right arrows select an earlier or a later save."
        className="rounded-md focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:outline-none"
        onKeyDown={(event) => {
          const step =
            event.key === "ArrowLeft"
              ? selected - 1
              : event.key === "ArrowRight"
                ? selected + 1
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? columns.length - 1
                    : null;
          if (step === null) return;
          event.preventDefault();
          select(Math.max(0, Math.min(columns.length - 1, step)));
        }}
      >
        <BySaveLedger
          columns={columns}
          rows={world ? rows : shownRows}
          allRows={rows}
          selected={selected}
          hovered={hovered}
          openColumn={openColumn}
          figure={figure}
          names={names}
          world={world}
          emphasized={
            world
              ? null
              : ([pointerEmphasis, focusEmphasis].find(
                  (key) => key !== null && shownRows.some((row) => row.key === key),
                ) ?? null)
          }
          onPointerEmphasis={setPointerEmphasis}
          onFocusEmphasis={setFocusEmphasis}
          onHover={(column) =>
            setHoveredId(column === null ? null : (columns[column]?.snapshot?.id ?? null))
          }
          onPick={select}
          header={header}
        />
      </div>
      <p aria-live="polite" aria-atomic className="sr-only">
        Selected {formatLongDate(selectedSave.date)}, {selectedSave.save.name}
      </p>
      {!world && hovered === null && (
        <NotAtThisSave rows={absent} column={selected} names={names} />
      )}
      <Foot campaign={campaign} chart={chart} unclear={unclear} />
    </div>
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
function Foot({
  campaign,
  chart,
  unclear,
}: {
  campaign: Eu4Campaign;
  chart: ChartCountries | null;
  /** The names of the tags whose holders cannot be told apart. */
  unclear: readonly string[];
}) {
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
    ...(unclear.length
      ? [
          `${unclear.join(", ")}: more than one country held this tag in a way the saves do not separate, so whose values are whose cannot be told.`,
        ]
      : []),
    ...(nav?.truncated ? ["Only the latest 200 uploads are listed."] : []),
  ];
  const countries = tags.length + unclear.length;
  const parts = [
    saveEntries.length > 0 && plural(saveEntries.length, "save", "saves"),
    countries > 0 && plural(countries, "country", "countries"),
  ].filter(Boolean);
  return (
    <Collapsible className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
      <AddSaves quiet />
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
