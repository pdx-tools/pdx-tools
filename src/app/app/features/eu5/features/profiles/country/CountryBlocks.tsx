import { useEffect, useMemo, useRef } from "react";
import { cx } from "class-variance-authority";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import {
  chartGutter,
  chartInk,
  chartTooltip,
  getEChartsTheme,
  neutralFill,
  neutralMark,
  selectionColor,
} from "@/components/viz/echartsTheme";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { focusRingInset } from "@/components/game/focusRing";
import { formatCount, formatFixedPercent, formatInt, formatMetric, formatTick } from "@/lib/format";
import type { CountryProfile, LandHistory, MapMode } from "@/wasm/wasm_eu5";
import { SectionTitle } from "../../../components";
import { useEu5Trigger } from "../useEu5Trigger";
import {
  useEu5Engine,
  useEu5MapMode,
  useEu5MapModeGradient,
  useEu5PaletteGradients,
  useEu5Players,
  useEu5SaveDate,
  useEu5Timeline,
  useEu5TimelineLive,
  useEu5TimelineMapDate,
} from "../../../store";
import { legendPosition, rampColor } from "../../../control-panel/Legend/GradientLegend";
import { RankList, RankRow, byDesc, countryRow, ModeRanking } from "../../../stack/ModeRanking";
import type { Ranked } from "../../../stack/ModeRanking";
import { isCountryMode, locationRowValue } from "../../../stack/compare";
import { Band, Finding } from "../../../stack/parts";
import { formatLongDate } from "@/features/timeline/date";
import { sectionEntry, usePanelNav } from "../PanelNavContext";
import { levelBody } from "../../../stack/levelBody";
import { useChartExport } from "../../../stack/chartExport";
import {
  RATIO_FLOOR,
  countOf,
  formatScore,
  landChapters,
  peerFinding,
  rankLabel,
} from "../../../stack/selection";
import { useStandings } from "../../../stack/Standings";
import { useDatedCountry } from "../../../stack/datedCountry";
import { OVERVIEW } from "./EconomyTab";

/** How many rows the block of the open mode shows. The rest are a click away. */
const BLOCK_ROWS = 5;

/** What the rows of a country mode hold */
const UNITS: Partial<Record<MapMode, { unit: string; title: string; worstFirst?: boolean }>> = {
  control: { unit: "Control", title: "control", worstFirst: true },
  development: { unit: "Dev", title: "development" },
  stateEfficacy: { unit: "Eff. Dev", title: "effective development" },
  wealth: { unit: "Wealth", title: "wealth" },
  unrealizedTaxBase: { unit: "Tax Gap", title: "tax gap", worstFirst: true },
  population: { unit: "Pop", title: "population" },
};

/**
 * The line that opens a country's view on this map: its place on what the map shows.
 * A mode with no country rank has no line, and the country's overall line leads.
 */
export function countryModeLine(
  profile: CountryProfile,
  mode: MapMode,
  peers?: readonly CountryProfile["overview"][],
): string | null {
  const line = worldModeLine(profile, mode);
  const amount = modeAmount(mode);
  if (!line || !peers || !amount) return line;
  const own = amount(profile.overview);
  const place = peers.filter((peer) => amount(peer) > own).length + 1;
  return `${line} Among the ${formatInt(peers.length)} players: #${formatInt(place)}.`;
}

/** The amount that a mode ranks a country by */
function modeAmount(mode: MapMode): ((d: CountryProfile["overview"]) => number) | null {
  switch (mode) {
    case "development":
      return (d) => d.totalDevelopment;
    case "stateEfficacy":
      return (d) => d.effectiveDevelopment;
    case "control":
      return (d) => d.weightedControl;
    case "wealth":
      return (d) => d.wealth;
    case "unrealizedTaxBase":
      return (d) => d.taxGap;
    case "population":
      return (d) => d.totalPopulation;
    case "buildingLevels":
      return (d) => d.buildingLevels;
    case "rgoLevel":
      return (d) => d.rgoLevels;
    default:
      return null;
  }
}

function worldModeLine(profile: CountryProfile, mode: MapMode): string | null {
  const { overview: d, header, religion } = profile;
  const { ranks } = d;
  const line = (rank: number, tied: number, metric: string, shown: string) =>
    `${header.name} is ${rankLabel(rank, tied)} of ${formatInt(ranks.cohort)} on ${metric}, ${shown}.`;
  switch (mode) {
    case "development":
      return line(
        ranks.development,
        ranks.ties.development,
        "development",
        formatMetric(d.totalDevelopment),
      );
    case "stateEfficacy":
      return line(
        ranks.effectiveDevelopment,
        ranks.ties.effectiveDevelopment,
        "effective development",
        formatMetric(d.effectiveDevelopment),
      );
    case "control":
      return ranks.control > 0
        ? `${header.name} is ${rankLabel(ranks.control, ranks.ties.control)} of ${formatInt(ranks.controlCohort)} on control, ${formatFixedPercent(d.weightedControl)}, among countries with ${RATIO_FLOOR}+ locations.`
        : `${header.name} has control of ${formatFixedPercent(d.weightedControl)}. With under ${RATIO_FLOOR} locations it has no rank.`;
    case "wealth":
      return line(ranks.wealth, ranks.ties.wealth, "wealth", formatMetric(d.wealth));
    case "unrealizedTaxBase":
      return line(ranks.taxGap, ranks.ties.taxGap, "tax base gap", formatMetric(d.taxGap));
    case "population":
      return line(
        ranks.totalPopulation,
        ranks.ties.totalPopulation,
        "population",
        formatCount(d.totalPopulation),
      );
    case "buildingLevels":
      return line(
        ranks.buildingLevels,
        ranks.ties.buildingLevels,
        "building levels",
        formatCount(d.buildingLevels),
      );
    case "rgoLevel":
      return line(ranks.rgo, ranks.ties.rgo, "RGO levels", formatCount(d.rgoLevels));
    case "religion": {
      const rows = religion.religionBreakdown;
      const total = rows.reduce((sum, row) => sum + row.population, 0);
      const top = [...rows].sort((a, b) => b.population - a.population)[0];
      return top && total > 0
        ? `${formatFixedPercent(top.population / total)} of the people of ${header.name} follow ${top.religion.name}.`
        : null;
    }
    default:
      return null;
  }
}

/**
 * The block of a stable country view that follows the map. Each row's mark is
 * the colour that the map gives the location, so the list is also the map's key.
 * The political map colours countries, so it has the country's neighbours in rank.
 */
export function CountryModeBlock({
  profile,
  countryIdx,
}: {
  profile: CountryProfile;
  countryIdx: number;
}) {
  const gradient = useEu5MapModeGradient();
  const palettes = useEu5PaletteGradients();
  const nav = usePanelNav();
  const mode = useEu5MapMode();
  if (mode === "political" || mode === "populationGrowth") return null;
  if (!isCountryMode(mode)) {
    return (
      <div>
        <ModeRanking key={mode} mode={mode} cap={BLOCK_ROWS} fixedCap />
      </div>
    );
  }
  const swatch = (value: number) =>
    gradient ? rampColor(palettes[gradient.palette], legendPosition(gradient, value)) : undefined;
  const meta = UNITS[mode];
  const rows: Ranked[] = profile.locations.locations
    .map((r) => ({ row: r, value: locationRowValue(r, mode) }))
    .filter((x): x is { row: typeof x.row; value: number } => x.value !== null)
    .sort(byDesc((x) => x.value))
    .map(({ row, value }) => ({
      key: row.location.key,
      name: row.location.name,
      color: swatch(value) ?? "",
      value,
      location: { key: row.location.key, name: row.location.name },
    }));
  const identity = {
    kind: "country" as const,
    country: { key: countryIdx, name: profile.header.name },
  };
  return (
    <div>
      <RankList
        mode={mode}
        ranking={{
          noun: `Locations by ${meta?.title ?? "value"}`,
          unit: meta?.unit ?? "",
          rows,
          cap: BLOCK_ROWS,
          fixedCap: true,
          quiet: true,
          ratio: mode === "control",
          // A problem mode asks where it is worst. Low control is the problem.
          ascending: mode === "control",
          worstNote: meta?.worstFirst ? "Worst first" : undefined,
        }}
        onShowAll={() => nav.open(sectionEntry(identity, "locations", "Locations"))}
      />
    </div>
  );
}

/** In a multiplayer save the group is the peer set, so the view says where a player stands in it. */
export function PeerLine({ countryIdx }: { countryIdx: number }) {
  const players = useEu5Players();
  const multiplayer = players.length > 1;
  const { data: board } = useEu5Trigger(
    (engine) => (multiplayer ? engine.queries.getPlayerCountries() : Promise.resolve(undefined)),
    [multiplayer],
  );
  const keys = board ?? [];
  const isPlayer = keys.includes(countryIdx);
  const standings = useStandings(isPlayer ? keys : []);
  const line = useMemo(() => {
    if (!standings || !isPlayer) return null;
    const own = standings.find((x) => x.countryIdx === countryIdx);
    if (!own) return null;
    const figures = OVERVIEW.flatMap((g) => g.figures)
      .filter((f) => f.rank)
      .map((f) => ({
        label: f.label,
        place:
          1 +
          standings.filter((x) => f.amount(x.profile.overview) > f.amount(own.profile.overview))
            .length,
      }));
    return peerFinding(standings.length, figures);
  }, [standings, isPlayer, countryIdx]);
  if (!line) return null;
  return (
    <p className="border-b border-game-line px-3.5 py-2 text-[12.5px] leading-snug text-game-ink-100">
      {line}
    </p>
  );
}

/** The country's neighbours in the game's great power rank, so that a rank has rivals */
export function GreatPowerNeighbours({
  countryIdx,
  cohort,
}: {
  countryIdx: number;
  cohort: number;
}) {
  const { data } = useEu5Trigger(
    (engine) => engine.queries.getPoliticalStanding(countryIdx),
    [countryIdx],
  );
  if (!data) return null;
  return (
    <div>
      <Band
        label={`Great power #${formatInt(data.rank)} of ${formatInt(cohort)} with land`}
        columns="Score"
      />
      {data.rows.map((row) => (
        <RankRow
          key={row.country.country.key}
          row={{
            ...countryRow(row.country, row.greatPowerPoints),
            rank: row.ordinalRank,
            rankTied: row.ordinalTied,
          }}
          display={formatScore(row.greatPowerPoints)}
          ranked
          current={row.country.country.key === countryIdx}
        />
      ))}
    </div>
  );
}

/**
 * The first line of a country at a past date: what is true on that date. The
 * save keeps land for each date, and all else only for the save date, which the
 * rail below says.
 */
export function DatedLead({ countryIdx, name }: { countryIdx: number; name: string }) {
  const date = useEu5TimelineMapDate();
  const data = useDatedCountry(countryIdx);
  if (!data) return null;
  const when = formatLongDate(date);
  return (
    <Finding>
      {data.locations > 0
        ? `${data.name} on ${when}: ${countOf(data.locations, "location").replace(" ", "\u00a0")}, #${formatInt(data.rank)} of ${formatInt(data.countryCount)} by land.`
        : `${data.name} holds no land on ${when}.`}
      {data.name !== name ? ` At the save it is ${name}.` : ""}
    </Finding>
  );
}

/**
 * The country's land across the campaign, from the ownership history of the save. A
 * click on the chart moves the map to that year.
 */
export function LandOverTime({ history, name }: { history: LandHistory; name: string }) {
  return <LandChart history={history} name={name} />;
}

function LandChart({ history, name }: { history: LandHistory; name: string }) {
  const engine = useEu5Engine();
  const saveDate = useEu5SaveDate();
  const live = useEu5TimelineLive();
  const mapDate = useEu5TimelineMapDate();
  const year = live ? null : mapDate.year;
  const notes = useEu5Timeline().notes;
  // Only the Political map has a history, so another map stays on its date.
  const canMove = useEu5MapMode() === "political";
  const canMoveRef = useRef(canMove);
  useEffect(() => {
    canMoveRef.current = canMove;
  }, [canMove]);
  const chapters = useMemo(() => landChapters(history), [history]);
  const chapterYears = useMemo(() => new Set(chapters.map((c) => c.year)), [chapters]);
  const title = `${name}: land by year`;
  const chartImage = useChartExport(title);

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();
    return {
      animation: false,
      grid: { ...chartGutter, left: 44, top: 22, bottom: 24, right: 12 },
      xAxis: {
        type: "value",
        min: "dataMin",
        max: "dataMax",
        axisLabel: {
          color: tickColor,
          fontSize: 12,
          formatter: (v: number) => String(v),
          hideOverlap: true,
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        min: 0,
        axisLabel: { color: tickColor, fontSize: 12, formatter: (v: number) => formatTick(v) },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5 } },
      },
      tooltip: {
        ...chartTooltip,
        trigger: "axis",
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          const value = arr[0]?.value as [number, number] | undefined;
          if (!value) return "";
          const events = notes.filter((n) => n.date.year === value[0]).map((n) => n.label);
          return [
            `<strong>${value[0]}</strong>`,
            countOf(value[1], "location"),
            ...events.map(escapeEChartsHtml),
          ].join("<br/>");
        },
      },
      series: [
        {
          type: "line",
          // A dot marks each chapter, so the chart and the list below it read as one.
          data: history.points.map((p) => ({
            value: [p.year, p.locations],
            symbol: chapterYears.has(p.year) ? "circle" : "none",
            symbolSize: 7,
            itemStyle: { color: chartInk.primary, borderColor: chartInk.surface, borderWidth: 1 },
          })),
          showSymbol: true,
          step: "end",
          lineStyle: { color: neutralMark, width: 2 },
          areaStyle: { color: neutralFill },
          markLine: {
            silent: true,
            symbol: "none",
            animation: false,
            data: [
              // World events stand on the axis, with their names at the pointer.
              ...notes.map((note) => ({
                xAxis: note.date.year,
                name: note.label,
                lineStyle: {
                  color: chartInk.muted,
                  width: 1,
                  type: "dashed" as const,
                  opacity: 0.6,
                },
                label: { show: false },
              })),
              ...(year === null
                ? []
                : [
                    {
                      xAxis: year,
                      lineStyle: { color: selectionColor, width: 1.5, type: "solid" as const },
                      label: { formatter: String(year), color: chartInk.primary, fontSize: 12 },
                    },
                  ]),
            ],
          },
        },
      ],
    };
  }, [history, year, notes, chapterYears]);

  const goTo = (target: number) => {
    engine.trigger.pauseTimeline();
    engine.trigger.setTimelineDate(
      target >= saveDate.year ? saveDate : { year: target, month: 1, day: 1 },
    );
  };

  return (
    <section className={levelBody}>
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>{title}</SectionTitle>
        {chartImage.button}
      </div>
      <EChart
        option={option}
        style={{ height: "150px", width: "100%" }}
        onInit={(chart) => {
          chartImage.track(chart);
          // A click anywhere in the plot moves the map to that year.
          chart.getZr().on("click", (event) => {
            const point = [event.offsetX, event.offsetY];
            if (!canMoveRef.current || !chart.containPixel("grid", point)) return;
            const [clicked] = chart.convertFromPixel("grid", point) as number[];
            goTo(Math.round(clicked));
          });
        }}
      />
      <ol aria-label={`The story of ${name}`} className="mt-1">
        {chapters.map((chapter) => {
          const on = year === chapter.year;
          return (
            <li key={chapter.year}>
              <button
                type="button"
                disabled={!canMove}
                aria-current={on || undefined}
                onClick={() => goTo(chapter.year)}
                className={cx(
                  "grid min-h-[26px] w-full grid-cols-[40px_minmax(0,1fr)] items-baseline gap-2 border-b border-game-line-faint py-1 text-left max-md:min-h-11",
                  canMove && "cursor-pointer hover:bg-game-panel-hover",
                  on && "bg-game-accent-soft",
                  focusRingInset,
                )}
              >
                <span className="font-game-num text-[12px] text-game-ink-100 tabular-nums">
                  {chapter.year}
                </span>
                <span className="text-[12px] leading-snug text-game-ink-300">{chapter.text}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-1 text-[12px] leading-snug text-game-ink-500">
        {canMove ? "A year or the chart moves the map to that date. " : ""}Dashed lines: world
        events.
      </p>
    </section>
  );
}
