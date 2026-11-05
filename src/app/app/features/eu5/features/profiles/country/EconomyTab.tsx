import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { cx } from "class-variance-authority";
import {
  formatCount,
  formatExact,
  formatFloat,
  formatInt,
  formatMetric,
  formatScale,
  formatTick,
} from "@/lib/format";
import type { CountryOverviewSection, LocationRow, MapMode } from "@/wasm/wasm_eu5";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import {
  chartGutter,
  chartTooltip,
  getEChartsTheme,
  neutralFill,
  neutralMark,
} from "@/components/viz/echartsTheme";
import { formatLongDate } from "@/features/timeline/date";
import { useEu5SaveDate } from "../../../store/eu5Store";
import { GameSegmented, SectionTitle, StatRail } from "../../../components";
import { formatScore } from "../../../stack/selection";
import type { LeadChart } from "../../../stack/selection";
import { pointLabel, pointsToSave } from "../../../stack/yearlySeries";
import { roundYearOffsets } from "../../insights/histogramAxis";
import { levelBody } from "../../../stack/levelBody";
import { useChartExport } from "../../../stack/chartExport";
import { MapModeLabel } from "../../../stack/parts";
import { rankPosition } from "../../../stack/selection";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function monthOffsetToDate(baseYear: number, baseMonth: number, offset: number): string {
  const totalMonths = baseYear * 12 + (baseMonth - 1) + offset;
  const year = Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12;
  return `${year} ${MONTH_NAMES[month]}`;
}

export type OverviewFigure = {
  label: string;
  /** The figure as a plain number, when it is compact. A row of a table then has one unit. */
  shown?: (d: CountryOverviewSection) => number;
  /** The map mode that shows this figure, if one does */
  mode?: MapMode;
  tooltip?: string;
  /** The figure can go under zero, so a bar of it needs a zero mark */
  signed?: boolean;
  value: (d: CountryOverviewSection) => string;
  /** The amount behind the figure, for its full value and for a bar */
  amount: (d: CountryOverviewSection) => number;
  rank?: (d: CountryOverviewSection) => number;
  /** How many countries share the rank, with this one */
  tied?: (d: CountryOverviewSection) => number;
};

/** A rating under 10 keeps two decimals, because many countries differ only there. */
const formatRating = (x: number) => (Math.abs(x) < 10 ? formatFloat(x, 2) : formatScale(x));

/** The overview figures, in sections. The Compare level shows the same rows. */
export const OVERVIEW: { section: string; figures: OverviewFigure[] }[] = [
  {
    section: "Standing",
    figures: [
      {
        label: "Score",
        tooltip:
          "Great power points, which only the leading countries hold: a dash means none. The rank follows the game's order, among the countries that own land.",
        value: (d) => formatScore(d.greatPowerPoints),
        amount: (d) => d.greatPowerPoints,
        rank: (d) => d.ranks.greatPower,
        tied: (d) => d.ranks.ties.greatPower,
      },
      {
        label: "Adm rating",
        tooltip: "The game's score rating for administration.",
        value: (d) => formatRating(d.admRating),
        amount: (d) => d.admRating,
        rank: (d) => d.ranks.admRating,
        tied: (d) => d.ranks.ties.admRating,
      },
      {
        label: "Dip rating",
        tooltip: "The game's score rating for diplomacy.",
        value: (d) => formatRating(d.dipRating),
        amount: (d) => d.dipRating,
        rank: (d) => d.ranks.dipRating,
        tied: (d) => d.ranks.ties.dipRating,
      },
      {
        label: "Mil rating",
        tooltip: "The game's score rating for the military.",
        value: (d) => formatRating(d.milRating),
        amount: (d) => d.milRating,
        rank: (d) => d.ranks.milRating,
        tied: (d) => d.ranks.ties.milRating,
      },
    ],
  },
  {
    section: "Economy",
    figures: [
      {
        label: "Gold after loans",
        tooltip: "Gold held, plus loans given, less loans owed. A stock, not a monthly balance.",
        signed: true,
        shown: (d) => d.netGold,
        value: (d) => formatMetric(d.netGold),
        amount: (d) => d.netGold,
        rank: (d) => d.ranks.netGold,
        tied: (d) => d.ranks.ties.netGold,
      },
      {
        label: "Income",
        shown: (d) => d.income,
        value: (d) => formatMetric(d.income),
        amount: (d) => d.income,
        rank: (d) => d.ranks.income,
        tied: (d) => d.ranks.ties.income,
      },
      {
        label: "Expense",
        // A large state spends more, so a low expense is not better in itself and
        // the game ranks no country by it.
        tooltip:
          "Has no rank and no best value: a large state spends more. Compare it with income.",
        shown: (d) => d.expense,
        value: (d) => formatMetric(d.expense),
        amount: (d) => d.expense,
      },
      {
        label: "Wealth",
        mode: "wealth",
        shown: (d) => d.wealth,
        value: (d) => formatMetric(d.wealth),
        amount: (d) => d.wealth,
        rank: (d) => d.ranks.wealth,
        tied: (d) => d.ranks.ties.wealth,
      },
      {
        label: "Tax Base",
        shown: (d) => d.taxBase,
        value: (d) => formatMetric(d.taxBase),
        amount: (d) => d.taxBase,
        rank: (d) => d.ranks.taxBase,
        tied: (d) => d.ranks.ties.taxBase,
      },
      {
        label: "Buildings",
        mode: "buildingLevels",
        shown: (d) => d.buildingLevels,
        value: (d) => formatCount(d.buildingLevels),
        amount: (d) => d.buildingLevels,
        rank: (d) => d.ranks.buildingLevels,
        tied: (d) => d.ranks.ties.buildingLevels,
      },
    ],
  },
  {
    section: "Society",
    figures: [
      {
        label: "Population",
        mode: "population",
        shown: (d) => d.totalPopulation,
        value: (d) => formatCount(d.totalPopulation),
        amount: (d) => d.totalPopulation,
        rank: (d) => d.ranks.totalPopulation,
        tied: (d) => d.ranks.ties.totalPopulation,
      },
    ],
  },
  {
    section: "Military",
    figures: [
      {
        label: "Manpower",
        shown: (d) => d.manpower * 1000,
        value: (d) => formatCount(d.manpower * 1000),
        amount: (d) => d.manpower * 1000,
        rank: (d) => d.ranks.manpower,
        tied: (d) => d.ranks.ties.manpower,
      },
      {
        label: "Max manpower",
        shown: (d) => d.maxManpower * 1000,
        value: (d) => formatCount(d.maxManpower * 1000),
        amount: (d) => d.maxManpower * 1000,
        rank: (d) => d.ranks.maxManpower,
        tied: (d) => d.ranks.ties.maxManpower,
      },
      {
        label: "Max sailors",
        shown: (d) => d.maxSailors * 1000,
        value: (d) => formatCount(d.maxSailors * 1000),
        amount: (d) => d.maxSailors * 1000,
        rank: (d) => d.ranks.maxSailors,
        tied: (d) => d.ranks.ties.maxSailors,
      },
      {
        label: "Army tradition",
        value: (d) => formatScale(d.armyTradition),
        amount: (d) => d.armyTradition,
        rank: (d) => d.ranks.armyTradition,
        tied: (d) => d.ranks.ties.armyTradition,
      },
      {
        label: "Navy tradition",
        value: (d) => formatScale(d.navyTradition),
        amount: (d) => d.navyTradition,
        rank: (d) => d.ranks.navyTradition,
        tied: (d) => d.ranks.ties.navyTradition,
      },
    ],
  },
  {
    section: "State",
    figures: [
      {
        label: "Eff. Dev",
        mode: "stateEfficacy",
        tooltip: "Effective Development: sum of control × development across owned locations.",
        shown: (d) => d.effectiveDevelopment,
        value: (d) => formatMetric(d.effectiveDevelopment),
        amount: (d) => d.effectiveDevelopment,
        rank: (d) => d.ranks.effectiveDevelopment,
        tied: (d) => d.ranks.ties.effectiveDevelopment,
      },
      {
        label: "Capacity",
        tooltip:
          "Active State Capacity: sum of population × control × development across owned locations.",
        shown: (d) => d.activeStateCapacity,
        value: (d) => formatMetric(d.activeStateCapacity),
        amount: (d) => d.activeStateCapacity,
        rank: (d) => d.ranks.activeStateCapacity,
        tied: (d) => d.ranks.ties.activeStateCapacity,
      },
      {
        label: "Stability",
        signed: true,
        value: (d) => formatScale(d.stability),
        amount: (d) => d.stability,
        rank: (d) => d.ranks.stability,
        tied: (d) => d.ranks.ties.stability,
      },
      {
        label: "Prestige",
        value: (d) => formatScale(d.prestige),
        amount: (d) => d.prestige,
        rank: (d) => d.ranks.prestige,
        tied: (d) => d.ranks.ties.prestige,
      },
      {
        label: "Gov. Power",
        value: (d) => formatScale(d.governmentPower),
        amount: (d) => d.governmentPower,
        rank: (d) => d.ranks.governmentPower,
        tied: (d) => d.ranks.ties.governmentPower,
      },
    ],
  },
];

export function CountryRankRail({
  data,
  atSave,
  peers,
}: {
  data: CountryOverviewSection;
  /** The save date, when the map shows another date */
  atSave?: string;
  /** The players' figures, when this country is a player's */
  peers?: readonly CountryOverviewSection[];
}) {
  const [scope, setScope] = useState<"world" | "players">("world");
  const among = scope === "players" && peers ? peers : undefined;
  const cohort = among ? among.length : data.ranks.cohort;
  const placeIn = (f: OverviewFigure) => {
    if (!among) return { rank: f.rank?.(data), tied: f.tied?.(data) };
    if (!f.rank) return { rank: undefined, tied: undefined };
    const own = f.amount(data);
    const amounts = among.map(f.amount);
    return {
      rank: amounts.filter((x) => x > own).length + 1,
      tied: amounts.filter((x) => x === own).length,
    };
  };
  const axis = among
    ? [{ label: "#1", at: 1 }]
    : [
        { label: "#100", at: rankPosition(100, cohort) },
        { label: "#10", at: rankPosition(10, cohort) },
        { label: "#1", at: 1 },
      ];
  return (
    <>
      <div className="flex items-center gap-2 px-3.5 pt-2.5">
        <p className="min-w-0 flex-1 text-[12px] leading-tight text-game-ink-500">
          {atSave ? `On the save date, ${atSave}. ` : ""}Rank among the {formatInt(cohort)}{" "}
          {among ? "players" : "countries that own land"}. The track is a log scale.
        </p>
        {peers ? (
          <GameSegmented
            aria-label="Ranks among"
            value={scope}
            onValueChange={(value) => setScope(value as typeof scope)}
          >
            <GameSegmented.Item value="world">World</GameSegmented.Item>
            <GameSegmented.Item value="players">Players</GameSegmented.Item>
          </GameSegmented>
        ) : null}
      </div>
      <StatRail>
        {OVERVIEW.flatMap(({ section, figures }) => [
          <StatRail.Section key={section} label={section} axis={axis} />,
          ...figures.map((f) => {
            const { rank, tied } = placeIn(f);
            return (
              <StatRail.Row
                key={f.label}
                label={f.mode ? <MapModeLabel mode={f.mode} label={f.label} /> : f.label}
                tooltip={f.tooltip}
                value={f.value(data)}
                exact={formatExact(f.amount(data))}
                percentile={rank !== undefined ? rankPosition(rank, cohort) : undefined}
                ticks={among ? [] : [rankPosition(100, cohort), rankPosition(10, cohort)]}
                rank={rank}
                tied={tied}
              />
            );
          }),
        ])}
      </StatRail>
    </>
  );
}

/** The country's charts. A wide frame sets them side by side. */
export function CountryCharts({
  name,
  data,
  locations,
  lead,
}: {
  name: string;
  data: CountryOverviewSection;
  locations: LocationRow[];
  /** The chart at the top of the view, which is not here again */
  lead: LeadChart;
}) {
  return (
    <div className={cx(levelBody, "grid grid-cols-1 gap-4 @[900px]:grid-cols-2")}>
      {lead !== "taxBase" ? (
        <HistoryChart
          title={`${name}: tax base by year`}
          series={data.historicalTaxBase}
          yLabel="Tax Base"
          isYearly
          now={data.taxBase}
        />
      ) : null}
      {lead !== "population" ? (
        <HistoryChart
          title={`${name}: population by year`}
          series={data.historicalPopulation}
          yLabel="Population"
          isYearly
          whole
          now={data.totalPopulation}
        />
      ) : null}
      <TaxGapList name={name} locations={locations} />
    </div>
  );
}

export function HistoryChart({
  title,
  series,
  yLabel,
  isYearly = false,
  whole = false,
  now,
}: {
  title: string;
  series: number[];
  yLabel: string;
  isYearly?: boolean;
  /** The figure on the save date, where a yearly record ends */
  now?: number;
  /** The values count people or things, so they read as whole numbers */
  whole?: boolean;
}) {
  const saveDate = useEu5SaveDate();
  const chartImage = useChartExport(title);

  const data = useMemo(
    () =>
      isYearly && now !== undefined && saveDate
        ? pointsToSave(series, saveDate, now).map(([x, y]) => [x - saveDate.year, y])
        : series.map((value, index) => [index - series.length + 1, value]),
    [series, isYearly, now, saveDate],
  );

  const option = useMemo((): EChartsOption => {
    const { axisColor, gridLineColor, tickColor } = getEChartsTheme();
    const baseYear = saveDate?.year ?? 0;
    const baseMonth = saveDate?.month ?? 1;

    const xFormatter = isYearly
      ? (value: number) => String(baseYear + value)
      : (value: number) => monthOffsetToDate(baseYear, baseMonth, value);

    const tooltipLabel = isYearly
      ? (offset: number) => pointLabel(baseYear + offset, formatLongDate(saveDate))
      : (offset: number) => monthOffsetToDate(baseYear, baseMonth, offset);

    const firstOffset = data.length > 0 ? (data[0] as number[])[0] : 0;
    const yearTicks = isYearly ? roundYearOffsets(firstOffset, baseYear) : undefined;

    return {
      // The section title names the quantity, so the chart has no axis name.
      grid: { ...chartGutter, top: 12, bottom: 24 },
      xAxis: {
        type: "value",
        axisLabel: {
          color: tickColor,
          fontSize: 12,
          customValues: yearTicks,
          formatter: xFormatter,
          hideOverlap: true,
        },
        axisTick: { customValues: yearTicks },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.35 } },
        min: "dataMin",
        max: "dataMax",
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: tickColor,
          fontSize: 12,
          formatter: (value: number) => formatTick(value),
        },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { type: "dashed", color: gridLineColor, opacity: 0.5 } },
      },
      tooltip: {
        ...chartTooltip,
        trigger: "axis",
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          const value = arr[0]?.value;
          if (!Array.isArray(value)) return "";
          const offset = Number(value[0]);
          const v = Number(value[1]);
          const shown = whole ? formatInt(Math.round(v)) : formatFloat(v, 2);
          return `<strong>${tooltipLabel(offset)}</strong><br/>${yLabel}: ${shown}`;
        },
      },
      series: [
        {
          type: "line",
          data,
          symbol: "none",
          smooth: true,
          lineStyle: { color: neutralMark, width: 2 },
          areaStyle: { color: neutralFill },
        },
      ],
    };
  }, [data, isYearly, saveDate, yLabel, whole]);

  if (series.length < 2) return null;

  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>{title}</SectionTitle>
        {chartImage.button}
      </div>
      <EChart
        option={option}
        style={{ height: "200px", width: "100%" }}
        onInit={chartImage.track}
      />
    </section>
  );
}

/** How many of the largest gaps the list has */
const GAPS_SHOWN = 10;

/**
 * The locations with the largest tax base gap, in gold. A bar is the wealth, and its
 * bright part is the tax base that the location realizes. A ranked list says the
 * gap directly, and it has room for each name.
 */
function TaxGapList({ name, locations }: { name: string; locations: LocationRow[] }) {
  const rows = useMemo(
    () =>
      locations
        .filter((r) => r.wealth - r.taxBase > 0)
        .sort((a, b) => b.wealth - b.taxBase - (a.wealth - a.taxBase))
        .slice(0, GAPS_SHOWN),
    [locations],
  );
  if (rows.length === 0) return null;
  const largest = Math.max(...rows.map((r) => r.wealth - r.taxBase));
  return (
    <section>
      <SectionTitle>{`${name}: largest tax base gaps`}</SectionTitle>
      <p className="mb-1 text-[12px] leading-snug text-game-ink-300">
        Gap: wealth less tax base. All bars start at zero.
      </p>
      {rows.map((row) => (
        <div
          key={row.location.key}
          className="grid h-[26px] grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_52px] items-center gap-2 border-b border-game-line-faint text-[12px]"
        >
          <span title={row.location.name} className="truncate text-game-ink-100">
            {row.location.name}
          </span>
          <span aria-hidden className="block h-1.5 rounded-[1px] bg-game-track">
            <span
              className="block h-full rounded-[1px] bg-game-ink-300"
              style={{ width: `${((row.wealth - row.taxBase) / largest) * 100}%` }}
            />
          </span>
          <span className="text-right font-game-num text-game-ink-100">
            {formatMetric(row.wealth - row.taxBase)}
          </span>
        </div>
      ))}
    </section>
  );
}

export function StatPlate({
  label,
  value,
  delta,
}: {
  label: string;
  value: ReactNode;
  delta?: { text: string; positive: boolean };
}) {
  return (
    <div className="min-w-0 border-r border-game-line bg-game-panel px-3 py-3 last:border-r-0">
      <SectionTitle className="mb-1.5 truncate">{label}</SectionTitle>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1 font-game-num text-[20px] font-medium text-game-ink-100 tabular-nums">
        {typeof value === "string" ? <span className="truncate">{value}</span> : value}
        {delta && (
          <span
            className={`shrink-0 text-[12px] ${delta.positive ? "text-game-good" : "text-game-err"}`}
          >
            {delta.text}
          </span>
        )}
      </div>
    </div>
  );
}
