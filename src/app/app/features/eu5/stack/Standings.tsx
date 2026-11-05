import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { cx } from "class-variance-authority";
import { focusRing, focusRingInset } from "@/components/game/focusRing";
import { sectionLabel } from "@/components/game/SectionTitle";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import {
  chartGutter,
  chartInk,
  chartTooltip,
  getEChartsTheme,
} from "@/components/viz/echartsTheme";
import { divergingPoles } from "@/components/viz/echartsTheme";
import { formatCompactIn, formatCount, formatInt, formatMetric, formatTick } from "@/lib/format";
import type { CountryProfile } from "@/wasm/wasm_eu5";
import { GameSegmented, SectionTitle } from "../components";
import { SortMark } from "../components/Eu5DataTable";
import { OVERVIEW } from "../features/profiles/country/EconomyTab";
import type { OverviewFigure } from "../features/profiles/country/EconomyTab";
import { ProfileSkeleton } from "../features/profiles/ProfileSkeleton";
import { useEu5SelectionTrigger, useEu5Trigger } from "../features/profiles/useEu5Trigger";
import { useEu5HomeCountry, useEu5SaveDate, useEu5SelectionState, useEu5World } from "../store";
import { useEu5MapHoverTarget } from "../useEu5MapHoverTarget";
import { Figure, Finding, Swatch, usePlayerName } from "./parts";
import { StandingsImageButton } from "./standingsImage";
import {
  columnPlaces,
  distinctInColumn,
  leaderDrivers,
  rankLabel,
  standingsFinding,
} from "./selection";
import { pointLabel, pointsToSave, yearOfDate } from "./yearlySeries";
import { formatLongDate } from "@/features/timeline/date";
import { useChartExport } from "./chartExport";
import type { MetricEntry } from "./selection";
import { useOpenCountry } from "./selected";

export type Standing = { countryIdx: number; profile: CountryProfile };

/** The profiles of the countries of a table. They load together, so the table has one state. */
export function useStandings(countryIdxs: readonly number[]) {
  const key = countryIdxs.join(",");
  const { data } = useEu5Trigger(
    (engine) =>
      Promise.all(
        countryIdxs.map(async (countryIdx) => {
          const profile = await engine.queries.getCountryProfile(countryIdx);
          return profile ? { countryIdx, profile } : null;
        }),
      ).then((rows) => rows.filter((x): x is Standing => x !== null)),
    [key],
  );
  return data;
}

const ALL_FIGURES = OVERVIEW.flatMap((group) => group.figures);
const SCORE = ALL_FIGURES.find((figure) => figure.label === "Score") as OverviewFigure;
const GROUPS = OVERVIEW;

/**
 * Each listed country against each metric, then the race. This is the one table of the
 * countries: the Political data tab and the full view of the world list show it.
 */
export function WorldStandings() {
  const query = useEu5SelectionTrigger((engine) => engine.queries.getPoliticalWorldScoreboard());
  const keys = (query.data?.rows ?? []).map((row) => row.country.country.key);
  const rows = useStandings(keys);
  const world = useEu5World();
  const isPlayers = useEu5SelectionState()?.preset === "players";
  if (!rows || rows.length === 0) return <ProfileSkeleton />;
  const line = standingsLine(rows);
  const drivers = driversLine(rows);
  return (
    <>
      {line ? <Finding>{line}</Finding> : null}
      <p className="px-3.5 pb-2 text-[12px] leading-snug text-game-ink-300">
        {drivers ? `${drivers} ` : ""}
        {isPlayers
          ? `${formatInt(rows.length)} of ${formatInt(world.countryCount)} countries with land: each player.`
          : `${formatInt(rows.length)} of ${formatInt(world.countryCount)} countries with land: the top 10 by score and each player.`}
      </p>
      <StandingsAndRace rows={rows} />
    </>
  );
}

/** From this width the race stands beside the table, so both are in view. */
const RACE_BESIDE_FROM = 1180;

/**
 * The table and the race. The race follows the column that sorts the table, when the
 * save has a history of that metric, so a click on a column shows how the order came.
 */
export function StandingsAndRace({ rows }: { rows: readonly Standing[] }) {
  const [ref, width] = useWidth();
  const [sorted, setSorted] = useState("Score");
  const [group, setGroup] = useState(DEFAULT_GROUP);
  const beside = width >= RACE_BESIDE_FROM && group !== ALL_GROUP;
  const raceId = RACES.find((race) => race.figure === sorted)?.id;
  return (
    <div
      ref={ref}
      className={cx(
        "gap-2 pt-2",
        beside ? "grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start" : "flex flex-col",
      )}
    >
      <StandingsTable rows={rows} onSort={setSorted} onGroup={setGroup} />
      <RaceChart rows={rows} follow={raceId} />
    </div>
  );
}

/** Where the leader on score stands among the rows on each other ranked metric */
export function driversLine(rows: readonly Standing[]): string | null {
  if (rows.length < 3) return null;
  const leader = [...rows].sort(
    (a, b) => SCORE.amount(b.profile.overview) - SCORE.amount(a.profile.overview),
  )[0];
  const places = ALL_FIGURES.filter((f) => f.rank && f !== SCORE).map((figure) => ({
    label: figure.label,
    ...columnPlaces(rows.map((x) => figure.amount(x.profile.overview)))[rows.indexOf(leader)],
  }));
  return leaderDrivers(leader.profile.header.name, places, rows.length);
}

export function standingsLine(
  rows: readonly Standing[],
  /** The metrics in view. A sentence says nothing of a metric that is not there. */
  shownFigures: readonly OverviewFigure[] = ALL_FIGURES,
): string | null {
  const entries = (figure: OverviewFigure): MetricEntry[] =>
    rows.map((x) => ({
      name: x.profile.header.name,
      value: figure.amount(x.profile.overview),
      // A sentence says that a country has no points, where a table has a dash.
      shown:
        figure === SCORE && figure.amount(x.profile.overview) <= 0
          ? "no points"
          : figure.value(x.profile.overview),
    }));
  return standingsFinding(
    "score",
    entries(SCORE),
    shownFigures
      .filter((f) => f.rank && f !== SCORE)
      .map((f) => ({
        label: f.label,
        entries: entries(f),
      })),
  );
}

/** The width of an element, for a table that shows more columns when it has the room */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const NAME_COLUMN = 150;
/** A name and a player's name on one line, each in full */
const NAME_AND_PLAYER_FULL = 340;
const FIGURE_COLUMN = 66;
const SORTED_COLUMN = 92;
/** Below this width a name and a player's name stack, because the frame is a column. */
const ONE_LINE_FROM = 760;
/** A column frame has less room, and the values still fit. */
const NARROW_FIGURE_COLUMN = 58;

const DEFAULT_GROUP = "Economy";
/** The tab of the table with each metric. It scrolls, with the names held in place. */
const ALL_GROUP = "All";

/**
 * The large set: a row for each country and a column for each metric of the open tab,
 * so each country is in view and the rows can be sorted. A cell is shaded by its place
 * in the column, so the leaders can be seen before the numbers are read.
 */
export function StandingsTable({
  rows,
  onSort,
  onGroup,
}: {
  rows: readonly Standing[];
  onSort?: (label: string) => void;
  onGroup?: (group: string) => void;
}) {
  const [ref, width] = useWidth();
  const [groupName, setGroupName] = useState(DEFAULT_GROUP);
  const [sort, setSort] = useState<{ label: string; direction: "asc" | "desc" }>({
    label: SCORE.label,
    direction: "desc",
  });
  const home = useEu5HomeCountry();
  const homeIdx = home?.countryIdx ?? null;
  const all = groupName === ALL_GROUP;
  const group = GROUPS.find((x) => x.section === groupName) ?? GROUPS[0];
  // A tab keeps to what has a rank. Expense has none, and the tab with each metric has it.
  const figures = all
    ? ALL_FIGURES
    : group.section === "Standing"
      ? group.figures
      : [SCORE, ...group.figures.filter((f) => f.rank)];
  const sortFigure = ALL_FIGURES.find((f) => f.label === sort.label) ?? SCORE;
  const ordered = useMemo(() => {
    const sign = sort.direction === "asc" ? 1 : -1;
    // A tie goes by the world rank, so that the order and the ranks agree.
    const rankOf = (x: Standing) => sortFigure.rank?.(x.profile.overview) ?? 0;
    return [...rows].sort(
      (a, b) =>
        sign * (sortFigure.amount(a.profile.overview) - sortFigure.amount(b.profile.overview)) ||
        rankOf(a) - rankOf(b),
    );
  }, [rows, sortFigure, sort.direction]);
  // The row of the person who reads the table stays first, with its true place.
  const shownRows = useMemo(
    () => [
      ...ordered.filter((row) => row.countryIdx === homeIdx),
      ...ordered.filter((row) => row.countryIdx !== homeIdx),
    ],
    [ordered, homeIdx],
  );
  const oneLine = width === 0 || width >= ONE_LINE_FROM;
  const nameColumn = oneLine ? NAME_AND_PLAYER_FULL : NAME_COLUMN;
  const figureColumn = oneLine ? FIGURE_COLUMN : NARROW_FIGURE_COLUMN;
  const grid = {
    // The sorted column also has the world rank.
    gridTemplateColumns: `${nameColumn}px ${figures
      .map(
        (figure) => `minmax(${figure.label === sort.label ? SORTED_COLUMN : figureColumn}px, 1fr)`,
      )
      .join(" ")}`,
    minWidth: nameColumn + (figures.length - 1) * figureColumn + SORTED_COLUMN + 14,
  };
  const places = useMemo(
    () =>
      new Map(
        ALL_FIGURES.map((figure) => [
          figure.label,
          columnPlaces(rows.map((x) => figure.amount(x.profile.overview))),
        ]),
      ),
    [rows],
  );

  return (
    <div ref={ref} className="min-w-0">
      <div className="flex flex-wrap items-center gap-2 px-3.5 pb-2">
        <GameSegmented
          aria-label="Metrics shown"
          value={groupName}
          onValueChange={(value) => {
            setGroupName(value);
            onGroup?.(value);
          }}
        >
          {[...GROUPS.map((x) => x.section), ALL_GROUP].map((section) => (
            <GameSegmented.Item key={section} value={section}>
              {section}
            </GameSegmented.Item>
          ))}
        </GameSegmented>
        <p className="text-[12px] text-game-ink-500">
          Shade: place in the column. Bold: top. Dotted: lowest. Orange: below zero.
        </p>
        <StandingsImageButton
          rows={ordered}
          figures={figures}
          tab={all ? "Each metric" : group.section}
          headline={standingsLine(rows, figures)}
        />
      </div>
      {/* On a phone the table scrolls sideways, and the keyboard can scroll it too. */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Standings table, scrolls sideways"
        className={cx("[scrollbar-width:thin] overflow-x-auto", focusRingInset)}
      >
        <div role="table" aria-label={`${formatInt(rows.length)} countries`}>
          {all ? (
            <div
              aria-hidden
              className="grid items-end border-b border-game-line-faint pr-3.5 pb-0.5"
              style={grid}
            >
              <span />
              {GROUPS.map((band) => (
                <span
                  key={band.section}
                  className={cx(sectionLabel, "border-b border-game-ink-rule pb-0.5 text-center")}
                  style={{ gridColumn: `span ${band.figures.length}` }}
                >
                  {band.section}
                </span>
              ))}
            </div>
          ) : null}
          <div
            role="row"
            className="sticky top-0 z-20 grid min-h-9 items-stretch border-b border-game-line bg-game-panel-2 pr-3.5"
            style={grid}
          >
            <span
              role="columnheader"
              className={cx(
                sectionLabel,
                "sticky left-0 z-10 flex items-center bg-game-panel-2 pl-3.5",
              )}
            >
              {formatInt(rows.length)} countries
            </span>
            {figures.map((figure) => {
              const on = sort.label === figure.label;
              return (
                <span
                  key={figure.label}
                  role="columnheader"
                  aria-sort={on ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                  className="flex items-center justify-end pr-1 pl-1.5"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSort(
                        on
                          ? {
                              label: figure.label,
                              direction: sort.direction === "asc" ? "desc" : "asc",
                            }
                          : { label: figure.label, direction: "desc" },
                      );
                      onSort?.(figure.label);
                    }}
                    title={figure.tooltip}
                    className={cx(
                      // A long label wraps at its word, on two lines of a fixed column.
                      "inline-flex min-h-6 cursor-pointer items-center justify-end gap-0.5 rounded-[2px] text-right font-game-ui text-[12px] leading-tight font-medium text-game-ink-300 hover:text-game-ink-100 max-md:min-h-11",
                      on && "text-game-ink-100",
                      focusRing,
                    )}
                  >
                    {figure.label}
                    {on ? <SortMark sorted={sort.direction} /> : null}
                  </button>
                </span>
              );
            })}
          </div>
          {shownRows.map((row) => (
            <StandingRow
              key={row.countryIdx}
              row={row}
              rows={rows}
              place={ordered.indexOf(row) + 1}
              figures={figures}
              grid={grid}
              oneLine={oneLine}
              sorted={sort.label}
              places={places}
              isHome={row.countryIdx === homeIdx}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StandingRow({
  row,
  rows,
  place,
  figures,
  grid,
  oneLine,
  sorted,
  places,
  isHome,
}: {
  row: Standing;
  rows: readonly Standing[];
  place: number;
  figures: readonly OverviewFigure[];
  grid: React.CSSProperties;
  oneLine: boolean;
  sorted: string;
  places: ReadonlyMap<string, readonly { place: number; tied: number }[]>;
  isHome: boolean;
}) {
  const openCountry = useOpenCountry();
  const player = usePlayerName(row.countryIdx);
  const hover = useEu5MapHoverTarget({ kind: "country", countryIdx: row.countryIdx });
  const { header, overview } = row.profile;
  const at = rows.indexOf(row);
  return (
    <div
      role="row"
      {...hover}
      className={cx(
        "group grid min-h-7 items-stretch border-b border-game-line-faint pr-3.5 hover:bg-game-panel-hover max-md:min-h-11",
        isHome && "border-b-game-line-strong",
      )}
      style={grid}
    >
      <span
        role="rowheader"
        className="sticky left-0 z-10 flex min-w-0 items-center bg-game-panel pl-3.5 group-hover:bg-game-panel-hover"
      >
        <button
          type="button"
          onClick={() =>
            openCountry({
              idx: row.countryIdx,
              name: header.name,
              anchor: header.anchorLocationIdx,
            })
          }
          className={cx(
            "flex min-h-6 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-[2px] text-left",
            focusRing,
          )}
        >
          <span className="w-5 shrink-0 text-right font-game-num text-[12px] text-game-ink-500 tabular-nums">
            {place}
          </span>
          <Swatch color={header.colorHex} size={12} />
          <span
            className={cx("flex min-w-0 flex-1", oneLine ? "items-baseline gap-2" : "flex-col")}
          >
            <span
              title={header.name}
              className={cx(
                "min-w-0 truncate text-[13px] leading-tight text-game-ink-100",
                oneLine && "flex-[3]",
              )}
            >
              {header.name}
            </span>
            {isHome ? <span className="shrink-0 text-[12px] text-game-accent-100">You</span> : null}
            {player ? (
              <span
                title={`Played by ${player}`}
                className={cx(
                  "min-w-0 truncate text-[12px] leading-tight text-game-ink-300",
                  oneLine && "flex-[2]",
                )}
              >
                {player}
              </span>
            ) : null}
          </span>
        </button>
      </span>
      {figures.map((figure) => (
        <StandingCell
          key={figure.label}
          figure={figure}
          rows={rows}
          overview={overview}
          sorted={sorted === figure.label}
          place={places.get(figure.label)?.[at]}
        />
      ))}
    </div>
  );
}

/** The values of a column as the table writes them: one form, and no false equal */
export function columnText(
  figure: OverviewFigure,
  rows: readonly Standing[],
  /** A rank stands beside each value, so a false equal would show. */
  withRanks = true,
): string[] {
  const overviews = rows.map((x) => x.profile.overview);
  const shown = figure.shown;
  const largest = shown ? Math.max(0, ...overviews.map((d) => Math.abs(shown(d)))) : 0;
  const text = overviews.map((d) =>
    shown ? formatCompactIn(shown(d), largest, figure.value(d)) : figure.value(d),
  );
  return withRanks ? distinctInColumn(overviews.map(figure.amount), text) : text;
}

function StandingCell({
  figure,
  rows,
  overview,
  sorted,
  place,
}: {
  figure: OverviewFigure;
  rows: readonly Standing[];
  overview: CountryProfile["overview"];
  sorted: boolean;
  place?: { place: number; tied: number };
}) {
  const amount = figure.amount(overview);
  // Only the sorted column has its ranks in view.
  const value = columnText(figure, rows, sorted)[
    rows.findIndex((x) => x.profile.overview === overview)
  ];
  const rank = figure.rank?.(overview);
  const tied = figure.tied?.(overview) ?? 1;
  const ranked = rank !== undefined && place !== undefined;
  const first = ranked && place.place === 1;
  const last = ranked && rows.length > 3 && place.place === rows.length && place.tied === 1;
  const worldRank = ranked
    ? `${figure.label}: ${figure.value(overview)}. ${rankLabel(rank, tied)} in the world, #${formatInt(place.place)} of ${formatInt(rows.length)} here.`
    : undefined;
  return (
    <span
      role="cell"
      title={worldRank}
      className="flex items-center justify-end gap-1.5 pr-1 pl-0.5 whitespace-nowrap"
      style={ranked ? { background: placeShade(place.place, rows.length) } : undefined}
    >
      {sorted && rank !== undefined ? (
        <span className="font-game-num text-[12px] leading-tight text-game-ink-500 tabular-nums">
          {rankLabel(rank, tied)}
        </span>
      ) : null}
      <span
        className={cx(
          "font-game-num text-[12.5px] leading-tight tabular-nums",
          first ? "font-semibold text-game-ink-100" : "text-game-ink-300",
          last && "underline decoration-dotted underline-offset-2",
        )}
        // Orange has one meaning: below zero.
        style={amount < 0 ? { color: divergingPoles.warm } : undefined}
      >
        <Figure>{value}</Figure>
      </span>
    </span>
  );
}

/** A neutral shade for a place in a column, strong at the top and gone at the bottom half */
function placeShade(place: number, of: number): string | undefined {
  const share = 1 - (place - 1) / Math.max(1, of - 1);
  if (share < 0.5) return undefined;
  const alpha = 0.03 + 0.13 * ((share - 0.5) * 2) ** 2;
  return `rgb(255 255 255 / ${alpha.toFixed(3)})`;
}

const RACES = [
  {
    id: "taxBase",
    label: "Tax base",
    figure: "Tax Base",
    series: (profile: CountryProfile) => profile.overview.historicalTaxBase,
    now: (profile: CountryProfile) => profile.overview.taxBase,
  },
  {
    id: "population",
    label: "Population",
    figure: "Population",
    series: (profile: CountryProfile) => profile.overview.historicalPopulation,
    now: (profile: CountryProfile) => profile.overview.totalPopulation,
  },
] as const;

/** The short race says its point in its title, from the figures of the table. */
function raceHeadline(rows: readonly Standing[]): string {
  const [first, second] = [...rows].sort(
    (a, b) => b.profile.overview.taxBase - a.profile.overview.taxBase,
  );
  if (!first) return "Tax base by year";
  const lead = `${first.profile.header.name} leads on tax base, ${formatMetric(first.profile.overview.taxBase)}`;
  return second
    ? `${lead}, ahead of ${second.profile.header.name}, ${formatMetric(second.profile.overview.taxBase)}`
    : lead;
}

/**
 * The race: each selected country's history on one chart, in its game colour. The
 * save keeps these two series for each country for each year. The short form says one
 * thing: who leads, and where the reader is. Other lines stay grey until the pointer
 * finds them.
 */
export function RaceChart({
  rows,
  compact = false,
  follow,
}: {
  rows: readonly Standing[];
  /** A short chart of the leaders, at the head of a list */
  compact?: boolean;
  /** The series that the table's sort asks for */
  follow?: (typeof RACES)[number]["id"];
}) {
  const saveDate = useEu5SaveDate();
  const home = useEu5HomeCountry();
  const [picked, setPicked] = useState<(typeof RACES)[number]["id"]>("taxBase");
  const [followed, setFollowed] = useState(follow);
  if (follow !== followed) {
    setFollowed(follow);
    if (follow) setPicked(follow);
  }
  const raceId = picked;
  const race = RACES.find((x) => x.id === raceId) ?? RACES[0];
  // Each country has its own small chart, so that each arc can be read. Two can share one.
  const multiples = !compact && rows.length > 2;
  const title = compact ? raceHeadline(rows) : `${race.label} by year`;
  const chartImage = useChartExport(title);
  const whole = race.id === "population";

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();
    const lines = rows
      .map((row) => {
        const last = race.now(row.profile);
        return {
          idx: row.countryIdx,
          name: row.profile.header.name,
          color: row.profile.header.colorHex,
          points: pointsToSave(race.series(row.profile), saveDate, last),
          last,
        };
      })
      .sort((a, b) => b.last - a.last);
    const shownValue = (value: number) => (whole ? formatCount(value) : formatMetric(value));
    return {
      animation: false,
      grid: { ...chartGutter, top: 12, bottom: 24, right: 158 },
      xAxis: {
        type: "value",
        min: "dataMin",
        max: "dataMax",
        axisLabel: {
          color: tickColor,
          fontSize: 12,
          formatter: (v: number) => String(Math.floor(v)),
          hideOverlap: true,
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: tickColor, fontSize: 12, formatter: (v: number) => formatTick(v) },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5 } },
      },
      tooltip: {
        ...chartTooltip,
        trigger: "item",
        formatter: (params) => {
          if (Array.isArray(params)) return "";
          const value = params.value as [number, number];
          const amount = whole ? formatInt(Math.round(value[1])) : formatMetric(value[1]);
          return `<strong>${escapeEChartsHtml(String(params.seriesName))}</strong><br/>${pointLabel(value[0], formatLongDate(saveDate))}: ${amount}`;
        },
      },
      series: lines.map((line, index) => {
        // The short form names the leader, the closest rival, and the reader. Each named
        // line has its game colour. A line with no name is context, in grey.
        const named = !compact || index < 2 || line.idx === home?.countryIdx;
        return {
          type: "line" as const,
          name: line.name,
          symbol: "none",
          triggerLineEvent: true,
          data: line.points,
          z: named ? 3 : 1,
          lineStyle: {
            color: named ? line.color : chartInk.muted,
            width: named ? 2 : 1,
            opacity: named ? 1 : 0.4,
          },
          emphasis: {
            focus: "series" as const,
            lineStyle: { color: line.color, width: 2.5, opacity: 1 },
          },
          endLabel: {
            show: named,
            formatter: `{name|${line.name}} {value|${shownValue(line.last)}}`,
            distance: 6,
            width: 150,
            overflow: "truncate" as const,
            color: line.color,
            rich: {
              name: { color: chartInk.primary, fontSize: 12 },
              value: { color: chartInk.primary, fontSize: 12, fontWeight: 600 },
            },
          },
          labelLine: { show: true, lineStyle: { color: line.color } },
          labelLayout: { moveOverlap: "shiftY" as const },
        };
      }),
    };
  }, [rows, race, saveDate, compact, home?.countryIdx, whole]);

  if (rows.every((row) => race.series(row.profile).length < 1)) return null;

  return (
    <section className={cx("@container", compact ? "px-3.5 pt-1 pb-2" : "px-3.5 py-3.5")}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <SectionTitle>{title}</SectionTitle>
        {multiples ? null : chartImage.button}
        {compact ? null : (
          <GameSegmented
            className="ml-auto"
            aria-label="Series shown"
            value={raceId}
            onValueChange={(value) => setPicked(value as typeof raceId)}
          >
            {RACES.map((x) => (
              <GameSegmented.Item key={x.id} value={x.id}>
                {x.label}
              </GameSegmented.Item>
            ))}
          </GameSegmented>
        )}
      </div>
      {multiples ? (
        <SmallMultiples rows={rows} race={race} />
      ) : (
        <EChart
          option={option}
          // A tall frame gives the chart its room.
          style={{ height: compact ? "max(170px, 24vh)" : "max(300px, 36vh)", width: "100%" }}
          onInit={chartImage.track}
        />
      )}
    </section>
  );
}

/**
 * Many histories overlaid are a tangle. Each country has its own small chart on one
 * shared scale, largest first, so that each arc can be read and compared.
 */
function SmallMultiples({
  rows,
  race,
}: {
  rows: readonly Standing[];
  race: (typeof RACES)[number];
}) {
  const saveDate = useEu5SaveDate();
  const cells = rows
    .map((row) => ({
      row,
      now: race.now(row.profile),
      points: pointsToSave(race.series(row.profile), saveDate, race.now(row.profile)),
    }))
    .sort((a, b) => b.now - a.now);
  const largest = Math.max(1, ...cells.flatMap((x) => x.points.map(([, y]) => y)));
  const from = Math.min(...cells.flatMap((x) => x.points.map(([x0]) => x0)));
  const to = yearOfDate(saveDate);
  const shownLargest = formatCompactIn(largest, largest, formatMetric(largest));
  return (
    <>
      <p className="mb-1.5 text-[12px] leading-snug text-game-ink-500">
        One scale for each chart, up to {shownLargest}, {Math.floor(from)} to {saveDate.year}.
        Largest on the save date first. The last value is the table&apos;s.
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 @[560px]:grid-cols-3 @[900px]:grid-cols-6">
        {cells.map(({ row, points, now }) => (
          <SmallMultiple
            key={row.countryIdx}
            row={row}
            points={points}
            now={now}
            largest={largest}
            from={from}
            to={to}
          />
        ))}
      </div>
    </>
  );
}

const MULTIPLE_WIDTH = 120;
const MULTIPLE_HEIGHT = 36;

function SmallMultiple({
  row,
  points,
  now,
  largest,
  from,
  to,
}: {
  row: Standing;
  points: readonly [number, number][];
  now: number;
  largest: number;
  from: number;
  to: number;
}) {
  const hover = useEu5MapHoverTarget({ kind: "country", countryIdx: row.countryIdx });
  const openCountry = useOpenCountry();
  const { header } = row.profile;
  const line = points
    .map(([year, value]) => {
      const x = ((year - from) / Math.max(1e-6, to - from)) * MULTIPLE_WIDTH;
      const y = MULTIPLE_HEIGHT - (Math.max(0, value) / largest) * (MULTIPLE_HEIGHT - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <button
      type="button"
      {...hover}
      onClick={() =>
        openCountry({ idx: row.countryIdx, name: header.name, anchor: header.anchorLocationIdx })
      }
      className={cx(
        "min-w-0 cursor-pointer rounded-[2px] border-b border-game-line text-left hover:bg-game-panel-hover",
        focusRing,
      )}
    >
      <span className="flex items-baseline justify-between gap-1.5">
        <span className="truncate text-[12px] leading-tight text-game-ink-100">{header.name}</span>
        <span className="shrink-0 font-game-num text-[12px] leading-tight text-game-ink-300 tabular-nums">
          {formatCompactIn(now, largest, formatMetric(now))}
        </span>
      </span>
      <svg
        aria-hidden
        viewBox={`0 0 ${MULTIPLE_WIDTH} ${MULTIPLE_HEIGHT}`}
        preserveAspectRatio="none"
        className="block h-9 w-full @[560px]:h-12 @[900px]:h-14"
      >
        <polyline
          points={line}
          fill="none"
          stroke={header.colorHex}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </button>
  );
}
