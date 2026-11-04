import type React from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { cx } from "class-variance-authority";
import XMarkIcon from "@heroicons/react/16/solid/XMarkIcon";
import PlusIcon from "@heroicons/react/16/solid/PlusIcon";
import type { CountryRef, MapMode, MarketRef } from "@/wasm/wasm_eu5";
import { focusRing, focusRingInset } from "@/components/game/focusRing";
import { sectionLabel } from "@/components/game/SectionTitle";
import {
  formatCompactIn,
  formatCount,
  formatExact,
  formatExactPercent,
  formatFixedPercent,
  formatMetric,
  formatRate,
} from "@/lib/format";
import { formatLegendValue } from "../control-panel/Legend/GradientLegend";
import { useEu5SelectionTrigger } from "../features/profiles/useEu5Trigger";
import {} from "../features/profiles/PanelNavContext";
import { usePanToEntity } from "../usePanToEntity";
import { composeEventHandlers, useEu5MapHoverTarget } from "../useEu5MapHoverTarget";
import type { Eu5MapHoverTarget } from "../useEu5MapHoverTarget";
import { useEu5Engine, useEu5Players, useEu5SelectionState } from "../store";
import {
  Band,
  DivergingHead,
  Figure,
  IconTip,
  PlayerTag,
  usePlayerName,
  ShowMoreRow,
  formatRank,
  rowClass,
  rowColumns,
  rowEnd,
} from "./parts";
import { DefinedTerm } from "../components/EntityName";
import { SortMark } from "../components/Eu5DataTable";
import { applyFloor, displayTag } from "./selection";
import { useAddCountry, useSelectedCountries } from "./selected";
import { useFrameSelection } from "./MapTools";
import { setMapHoverLabel } from "./MapLabels";

/**
 * The map's caption: the things the open mode colours, in order, each with
 * its value as a bar. A bar's length compares the rows, relative to the
 * largest shown. The bar is neutral, because the swatch or the icon of the row
 * already carries its identity.
 */

export type Ranked = {
  key: string | number;
  name: string;
  tag?: string;
  color: string;
  player?: boolean;
  /** The game's great-power rank, 1-based */
  rank?: number;
  value: number;
  /** The value as the row shows it, when the ranking's format does not fit */
  display?: string;
  country?: CountryRef;
  market?: MarketRef;
  location?: { key: number; name: string };
  /** The row is the player's own country, so it stays on top */
  lifted?: boolean;
  /** A note for the pointer, such as what stands behind a share */
  title?: string;
  /** The identifier in place of a swatch, such as a good's icon */
  leading?: React.ReactNode;
  /** The bar in place of the neutral one, such as a good's surplus and shortage */
  barContent?: React.ReactNode;
};

export type Ranking = {
  /** What the rows are, for the band */
  noun: string;
  /** What the value is, for the band */
  unit: string;
  rows: Ranked[];
  /**
   * Each row also shows the game's rank. The great powers keep it, and the list
   * can skip ranks, because it holds the top ten and each human player.
   */
  unordered?: boolean;
  /** Each row has a diverging bar, so the band names its two sides */
  diverging?: boolean;
  /** The list has this many rows and a way to show the rest, in place of filling the column */
  cap?: number;
  /** The list is one of several, so it has no finding of its own */
  quiet?: boolean;
  /** The rows are the parts of one whole, so each row also shows its share. */
  parts?: boolean;
  format?: (value: number) => string;
};

export const byDesc =
  <T,>(key: (row: T) => number) =>
  (a: T, b: T) =>
    key(b) - key(a);

export const countryRow = (country: CountryRef, value: number): Ranked => ({
  key: country.country.key,
  name: country.country.name,
  tag: displayTag(country.tag),
  color: country.colorHex,
  player: country.isPlayer,
  value,
  country,
});

/**
 * The ranking of the open mode. A mode that measures an amount ranks the
 * countries by their total, and the value and the bar show that total.
 * A mode that measures a ratio ranks by the ratio. In the world ranking a
 * ratio needs a size floor, so that a state with one good location does
 * not lead; a ranking narrowed to a selection shows each country in it.
 */
export function useRanking(mode: MapMode): Ranking | null {
  const selection = useEu5SelectionState();
  const world = selection == null || selection.isEmpty;
  // The floor never hides the player's own country.
  const floor = <T extends { locationCount: number }>(rows: T[], player: (row: T) => boolean) =>
    world ? applyFloor(rows, (r) => r.locationCount, player) : rows;

  // Each mode asks for its own insight; the root shows one mode at a time.
  const query = useEu5SelectionTrigger(
    (engine): Promise<Ranking> => {
      switch (mode) {
        case "political":
          return engine.queries.getPoliticalWorldScoreboard().then((x) => ({
            noun: "Countries",
            unit: "Score",
            unordered: true,
            rows: x.rows.map((r) => ({
              ...countryRow(r.country, r.greatPowerPoints),
              rank: r.ordinalRank,
            })),
            format: formatCount,
          }));
        case "control":
          return engine.queries.getControlInsight().then((x) => ({
            noun: "Countries",
            unit: "Control",
            rows: floor(x.scatterCountries, (r) => r.country.isPlayer)
              .sort(byDesc((r) => r.weightedAvgControl))
              .map((r) => countryRow(r.country, r.weightedAvgControl)),
          }));
        case "development":
          return engine.queries.getDevelopmentInsight().then((x) => ({
            noun: "Countries",
            unit: "Total Dev",
            format: formatMetric,
            rows: [...x.countries]
              .sort(byDesc((r) => r.totalDevelopment))
              .map((r) => countryRow(r.country, r.totalDevelopment)),
          }));
        case "stateEfficacy":
          return engine.queries.getStateEfficacy().then((x) => ({
            noun: "Countries",
            unit: "Total Eff. Dev",
            format: formatMetric,
            rows: [...x.countries]
              .sort(byDesc((r) => r.totalEfficacy))
              .map((r) => countryRow(r.country, r.totalEfficacy)),
          }));
        case "wealth":
          return engine.queries.getWealthInsight().then((x) => ({
            noun: "Countries",
            unit: "Total Wealth",
            format: formatMetric,
            rows: [...x.countries]
              .sort(byDesc((r) => r.totalWealth))
              .map((r) => countryRow(r.country, r.totalWealth)),
          }));
        case "unrealizedTaxBase":
          return engine.queries.getUnrealizedTaxBaseInsight().then((x) => ({
            noun: "Countries",
            unit: "Total Tax Gap",
            format: formatMetric,
            rows: [...x.countries]
              .sort(byDesc((r) => r.unrealizedTaxBase))
              .map((r) => countryRow(r.country, r.unrealizedTaxBase)),
          }));
        case "population":
          return engine.queries.getPopulationInsight().then((x) => ({
            noun: "Countries",
            unit: "Total Pop",
            format: formatCount,
            rows: [...x.countries]
              .sort(byDesc((r) => r.totalPopulation))
              .map((r) => countryRow(r.country, r.totalPopulation)),
          }));
        case "populationGrowth":
          return engine.queries.getPopulationGrowthInsight().then((x) => ({
            noun: "Countries",
            unit: "Growth / yr",
            rows: floor(x.countries, (r) => r.country.isPlayer)
              .sort(byDesc((r) => r.growthRate))
              .map((r) => countryRow(r.country, r.growthRate)),
          }));
        case "religion":
          return engine.queries.getReligionInsight().then((x) => ({
            noun: "Religions",
            unit: "Followers · Share",
            format: formatCount,
            parts: true,
            rows: [...x.religions].sort(byDesc((r) => r.followerPopulation)).map((r) => ({
              key: r.religion.key,
              name: r.religion.name,
              color: r.colorHex,
              value: r.followerPopulation,
            })),
          }));
        case "markets":
          return engine.queries.getMarketInsight().then((x) => ({
            noun: "Markets",
            unit: "Value",
            format: formatMetric,
            rows: [...x.markets].sort(byDesc((r) => r.marketValue)).map((r) => ({
              key: r.market.market.key,
              name: r.market.market.name,
              color: r.market.colorHex,
              value: r.marketValue,
              market: r.market,
            })),
          }));
        case "rgoLevel":
          return engine.queries.getRgoInsight().then((x) => ({
            noun: "Raw materials",
            unit: "RGO Level",
            rows: floor(x.materials, () => false)
              .sort(byDesc((r) => r.avgRgoLevel))
              .map((r) => ({
                key: r.rawMaterial.key,
                name: r.rawMaterial.name,
                color: r.rawMaterial.colorHex,
                value: r.avgRgoLevel,
              })),
          }));
        case "buildingLevels":
          return engine.queries.getBuildingLevelsInsight().then((x) => ({
            noun: "Buildings",
            unit: "Levels",
            format: formatCount,
            rows: [...x.types].sort(byDesc((r) => r.levels)).map((r) => ({
              key: r.building.key,
              name: r.building.name,
              color: "",
              value: r.levels,
            })),
          }));
      }
    },
    [mode, world],
  );
  return query.data ?? null;
}

/** The height of one row, with its rule */
const ROW_HEIGHT = 30;

/**
 * How many rows fill the column below `ref`. The count follows the column
 * height after a resize settles, so a drag of the window does not make the
 * rows jump on each frame.
 */
function useFillCount(min = 8, max = 60) {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(min);

  useLayoutEffect(() => {
    const el = ref.current;
    const body = el?.closest<HTMLElement>("[data-column-body]");
    if (!el || !body) return;
    const measure = () => {
      const top =
        el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
      const rows = Math.floor((body.clientHeight - top) / ROW_HEIGHT);
      setCount(Math.max(min, Math.min(max, rows)));
    };
    measure();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(measure, 150);
    });
    // The content above the rows can load after them, so watch it too.
    observer.observe(body);
    for (const child of Array.from(body.children)) observer.observe(child);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [min, max]);

  return [ref, count] as const;
}

/**
 * A ranked list in the caption's grammar: the lifted rows on top in a
 * tinted group, then as many rows as fill the column.
 */
export function RankList({ ranking, mode }: { ranking: Ranking; mode: MapMode }) {
  const selectionState = useEu5SelectionState();
  const [fillRef, fill] = useFillCount();
  const [showAll, setShowAll] = useState(false);
  const shown = ranking.cap === undefined ? fill : showAll ? ranking.rows.length : ranking.cap;
  const baseFormat =
    ranking.format ??
    ((v: number) => (mode === "populationGrowth" ? formatRate(v) : formatLegendValue(mode, v)));
  // A list without its own format shows a ratio or a level. A row's own title goes first.
  const ratio = !ranking.format && (mode === "control" || mode === "populationGrowth");
  const exact = (value: number) => (ratio ? formatExactPercent(value) : formatExact(value));
  // One unit in the column, from its largest value, when the column is compact.
  const columnLargest = Math.max(0, ...ranking.rows.map((r) => Math.abs(r.value)));
  const compact = ranking.format === formatMetric || ranking.format === formatCount;
  const format = (v: number) =>
    compact && columnLargest >= 1000
      ? formatCompactIn(v, columnLargest, baseFormat(v))
      : baseFormat(v);
  const lifted = ranking.rows.filter((r) => r.lifted);
  const rest = ranking.rows.filter((r) => !r.lifted).slice(0, shown);
  const largest = Math.max(0, ...[...lifted, ...rest].map((r) => r.value));
  const whole = ranking.rows.reduce((sum, r) => sum + r.value, 0);
  const share = (row: Ranked) =>
    ranking.parts && whole > 0 ? formatFixedPercent(row.value / whole) : undefined;
  const flush = !ranking.rows.some((r) => r.leading || r.color);
  const bar = (row: Ranked) => ({
    // The parts of one whole are measured against the whole, so a bar is the share.
    fraction: ranking.parts
      ? whole > 0
        ? row.value / whole
        : 0
      : largest > 0
        ? Math.max(0, row.value) / largest
        : 0,
    ranked: ranking.unordered,
    flush,
  });

  if (ranking.rows.length === 0) return null;
  // The list leads with its finding, as a level does. Computed, never written by hand.
  // A selection already says how much it holds, so only the world's list has a count.
  const world = selectionState == null || selectionState.isEmpty;
  const leader = ranking.rows[0];
  const lead =
    ranking.rows.length > 1 && !ranking.quiet
      ? `${world ? `${ranking.rows.length} ${ranking.noun.toLowerCase()}. ` : ""}${leader.name} leads with ${leader.display ?? format(leader.value)}`
      : null;
  return (
    <>
      {lead ? (
        <p className="px-3.5 pb-2 text-[12px] leading-tight text-game-ink-300">{lead}</p>
      ) : null}
      {ranking.diverging ? (
        <DivergingBand noun={ranking.noun} />
      ) : ranking.unordered ? (
        <RankBand noun={ranking.noun} unit={ranking.unit} />
      ) : (
        <Band label={ranking.noun} columns={ranking.unit} sorted flush />
      )}
      {lifted.map((row) => (
        <RankRow
          key={row.key}
          row={row}
          display={row.display ?? format(row.value)}
          dim={share(row)}
          exact={exact(row.value)}
          {...bar(row)}
        />
      ))}
      <div ref={fillRef}>
        {rest.map((row) => (
          <RankRow
            key={row.key}
            row={row}
            display={row.display ?? format(row.value)}
            dim={share(row)}
            exact={exact(row.value)}
            {...bar(row)}
          />
        ))}
      </div>
      {ranking.cap !== undefined ? (
        <ShowMoreRow
          hidden={ranking.rows.length - lifted.length - rest.length}
          expanded={showAll}
          onToggle={() => setShowAll((x) => !x)}
        />
      ) : null}
    </>
  );
}

/** A band with the two sides of a diverging bar, on the zero line of the bar */
function DivergingBand({ noun }: { noun: string }) {
  return (
    <div
      className={cx(rowEnd, "grid h-7 items-center gap-2.5 bg-game-panel-2 pl-3.5")}
      style={{ gridTemplateColumns: rowColumns({ bar: true, value: true }) }}
    >
      <span className={cx(sectionLabel, "col-span-2")}>{noun}</span>
      <DivergingHead />
      <span />
    </div>
  );
}

/** A band over rows in the game's order: the sort mark says that the rank sorts the list. */
function RankBand({ noun, unit }: { noun: string; unit: string }) {
  return (
    <div
      className={cx(rowEnd, "grid h-7 items-center gap-2.5 bg-game-panel-2 pl-3.5")}
      style={{ gridTemplateColumns: rowColumns({ bar: true, value: true }) }}
    >
      <span className={cx(sectionLabel, "col-span-2")}>{noun}</span>
      <span
        aria-sort="ascending"
        className={cx(sectionLabel, "flex items-center justify-end gap-1 text-game-ink-100")}
      >
        Rank
        <SortMark sorted="asc" />
      </span>
      <span className={cx(sectionLabel, "text-right whitespace-nowrap")}>
        <DefinedTerm label={unit} />
      </span>
    </div>
  );
}

/**
 * The world's ranking for the mode, narrowed to the selection. The
 * countries in `lift` stay on top.
 */
export function ModeRanking({ mode, lift = [] }: { mode: MapMode; lift?: readonly number[] }) {
  const ranking = useRanking(mode);
  if (!ranking) return null;
  const rows = ranking.rows.map((row) =>
    row.country && lift.includes(row.country.country.key) ? { ...row, lifted: true } : row,
  );
  return <RankList ranking={{ ...ranking, rows }} mode={mode} />;
}

function hoverTargetOf(row: Ranked): Eu5MapHoverTarget | null {
  if (row.country) return { kind: "country", countryIdx: row.country.country.key };
  if (row.market) return { kind: "market", marketId: row.market.market.key };
  if (row.location) return { kind: "location", locationIdx: row.location.key };
  return null;
}

/**
 * One row of the column's lists, in the template of `rowColumns`: mark, name,
 * bar or rank, value, and a chevron when the row opens a level.
 */
export function RankRow({
  row,
  display,
  dim,
  exact,
  fraction,
  ranked = false,
  flush = false,
}: {
  row: Ranked;
  display: string;
  /** A second figure after the value. A row with two figures has no bar. */
  dim?: string;
  /** The full value, for the pointer, when the figure is compact */
  exact?: string;
  /** The length of the bar, relative to the largest row. Without it, the slot of the bar stays empty. */
  fraction?: number;
  /** The rank sorts the list and takes the slot of the bar, so the value is secondary */
  ranked?: boolean;
  /** No row of the group has a mark, so the row has no mark slot */
  flush?: boolean;
}) {
  const engine = useEu5Engine();
  const panToEntity = usePanToEntity();
  const frame = useFrameSelection();
  const addCountry = useAddCountry();
  const selection = useEu5SelectionState();
  const selected = useSelectedCountries();
  const mapHover = useEu5MapHoverTarget(hoverTargetOf(row));
  const { country, market, location } = row;
  // In a multiplayer save the people are the subject, so a player's row has the name.
  const playerName = usePlayerName(country?.country.key);
  const multiplayerSave = useEu5Players().length > 1;
  // The row names itself on the map while it has the pointer, with its value.
  const anchor =
    country?.anchorLocationIdx ?? market?.anchorLocationIdx ?? location?.key ?? undefined;
  const labelOn = () => {
    if (anchor !== undefined) {
      setMapHoverLabel({ key: `${row.key}`, text: `${row.name} ${display}`, locationIdx: anchor });
    }
  };
  const labelOff = () => setMapHoverLabel(null);
  const hover = {
    ...mapHover,
    onMouseEnter: composeEventHandlers(mapHover.onMouseEnter, labelOn),
    onMouseLeave: composeEventHandlers(mapHover.onMouseLeave, labelOff),
    onFocus: composeEventHandlers(mapHover.onFocus, labelOn),
    onBlur: composeEventHandlers(mapHover.onBlur, labelOff),
  };
  // A row selects what it names, and nothing more. The tabs have the levels.
  const open = country
    ? () => {
        void engine.commands.selectCountry(country.country.key).then(frame);
      }
    : market
      ? () => {
          void engine.commands.selectMarket(market.market.key);
          panToEntity(market.anchorLocationIdx);
        }
      : location
        ? () => {
            void engine.commands.setFocusedLocation(location.key);
            panToEntity(location.key);
          }
        : undefined;

  // A country that is not in the selection can join it.
  const inSelection =
    country !== undefined &&
    ((selection?.activeProfile?.kind === "country" &&
      selection.activeProfile.country.key === country.country.key) ||
      selected.some((c) => c.country.key === country.country.key));
  const add = country && !inSelection ? () => addCountry(country.country.key) : undefined;
  const inSet = country !== undefined && selected.length > 1 && inSelection;

  const hasDim = dim !== undefined;
  const content: React.ReactNode = (
    <>
      {/* A row without a mark keeps the slot empty when another row of its group has a mark. */}
      {flush ? null : (
        <span className="flex items-center">
          {row.leading ? (
            row.leading
          ) : row.color ? (
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 rounded-[2px] shadow-[inset_0_0_0_1px_var(--game-rim)]"
              style={{ background: row.color }}
            />
          ) : null}
        </span>
      )}
      {/* The name stays whole: the tag gives way first, and a long name goes to a second line. */}
      {/* In a multiplayer save each player has the name on a second line, so rows keep one rhythm. */}
      <span
        className={cx(
          "flex min-w-0",
          multiplayerSave ? "flex-col gap-0.5 py-1" : "flex-wrap items-center gap-x-1.5",
        )}
      >
        <span className="max-w-full min-w-0 shrink-0 text-[13px] leading-tight text-game-ink-100">
          {row.name}
          {multiplayerSave && row.tag ? (
            <span className="ml-1.5 font-game-ui text-[12px] text-game-ink-500">{row.tag}</span>
          ) : null}
        </span>
        {playerName ? (
          <span className="font-game-ui text-[12px] leading-tight text-game-ink-300">
            {playerName}
          </span>
        ) : multiplayerSave ? null : (
          <>
            {row.tag ? (
              <span className="font-game-ui text-[12px] whitespace-nowrap text-game-ink-500">
                {row.tag}
              </span>
            ) : null}
            {row.player ? <PlayerTag countryKey={country?.country.key} /> : null}
          </>
        )}
      </span>
      {ranked ? (
        <span className="text-right font-game-num text-[12px] whitespace-nowrap text-game-ink-300 tabular-nums">
          {row.rank !== undefined ? formatRank(row.rank) : null}
        </span>
      ) : row.barContent ? (
        row.barContent
      ) : typeof fraction === "number" ? (
        <span aria-hidden className="h-1.5 overflow-hidden rounded-[2px] bg-game-track">
          {fraction > 0 ? (
            <span
              className="block h-full rounded-[1px] bg-game-ink-300"
              // A value that is not zero stays visible.
              style={{ width: `${fraction * 100}%`, minWidth: 2 }}
            />
          ) : null}
        </span>
      ) : (
        <span />
      )}
      <span className="text-right font-game-num text-[13px] font-medium whitespace-nowrap text-game-ink-100 tabular-nums">
        <Figure>{display}</Figure>
      </span>
      {hasDim ? (
        <span className="text-right font-game-num text-[12px] whitespace-nowrap text-game-ink-500 tabular-nums">
          {dim}
        </span>
      ) : null}
    </>
  );
  const grid: React.CSSProperties = {
    gridTemplateColumns: rowColumns({ flush, bar: true, value: true, dim: hasDim }),
  };

  // The row's full value, for the pointer, when the figure is compact.
  const title = row.title ?? (exact !== undefined && exact !== display ? exact : undefined);
  const main = !open ? (
    <div className={rowClass} style={grid} title={title}>
      {content}
    </div>
  ) : (
    <button
      type="button"
      onClick={open}
      title={title}
      style={grid}
      className={cx(rowClass, "cursor-pointer group-hover:bg-game-panel-hover", focusRingInset)}
    >
      {content}
    </button>
  );

  return (
    <div className="group relative" {...hover}>
      {main}
      {/* The end of a country's row says what the row can do to the selection, at rest. */}
      {country && (add || inSet) ? (
        <IconTip side="top" label={add ? "Add to selection" : "Remove from selection"}>
          <button
            type="button"
            onClick={add ?? (() => void engine.commands.removeCountry(country.country.key))}
            aria-label={
              add
                ? `Add ${country.country.name} to the selection`
                : `Remove ${country.country.name} from the selection`
            }
            className={cx(
              "absolute top-1/2 right-0.5 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-control text-game-ink-300 transition-colors hover:bg-game-panel-active hover:text-game-ink-100 max-md:right-0 max-md:h-11 max-md:w-11",
              focusRing,
            )}
          >
            {add ? (
              <PlusIcon aria-hidden className="h-3.5 w-3.5" />
            ) : (
              <XMarkIcon aria-hidden className="h-3.5 w-3.5" />
            )}
          </button>
        </IconTip>
      ) : null}
    </div>
  );
}
