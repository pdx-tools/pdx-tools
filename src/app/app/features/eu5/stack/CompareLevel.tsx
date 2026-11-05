import type React from "react";
import { useEffect, useState } from "react";
import { cx } from "class-variance-authority";
import { focusRing, focusRingInset } from "@/components/game/focusRing";
import { formatExact, formatInt } from "@/lib/format";
import { SortMark } from "../components/Eu5DataTable";
import { useEu5MapMode, useEu5Players } from "../store";
import { OVERVIEW } from "../features/profiles/country/EconomyTab";
import type { OverviewFigure } from "../features/profiles/country/EconomyTab";
import { ProfileSkeleton } from "../features/profiles/ProfileSkeleton";
import { useRanking } from "./ModeRanking";
import { useOpenCountry, useSelectedCountries } from "./selected";
import {
  COMPARE_MAX,
  STANDINGS_MAX,
  bestIsTied,
  bestRank,
  compareBars,
  compareColumns,
  displayTag,
} from "./selection";
import { RaceChart, StandingsAndRace, columnText, standingsLine, useStandings } from "./Standings";
import { StandingsImageButton } from "./standingsImage";
import type { Standing } from "./Standings";
import {
  Band,
  ExactValue,
  Figure,
  IconTip,
  Finding,
  MapGlyph,
  MapModeLabel,
  Note,
  PlayerTag,
  Swatch,
  formatRank,
  usePlayerName,
} from "./parts";
import { useFrameSelection } from "./frameSelection";
import { useFullView } from "./fullView";
import { divergingPoles } from "@/components/viz/echartsTheme";
import { useViewportInsets } from "../useViewportInsets";
import { glossaryTerm } from "../components/EntityName";
import { Tooltip } from "@/components/Tooltip";
import { useBreakpoint } from "@/hooks/useBreakpoint";

/** A country of the selection with its profile */
type Column = Standing;

/** The narrowest and the widest column of figures. The space after the widest columns stays empty. */
const LABEL_MIN = 118;
const LABEL_MAX = 160;
const COLUMN_MIN = 100;
/**
 * On a phone the label has its own line over the figures, and the rank is under
 * the value. Four countries fit whole at 390px in equal columns. With five or more
 * the table scrolls, and the head of the next column shows at the end.
 */
const PHONE_COLUMN_MIN = 84;
/** The start inset of a row. The last cell's own padding is the inset at the end. */
const PADDING = 14;

/**
 * The countries of the selection side by side. A few countries have a column each:
 * one row for each overview figure, with the value, the world rank, and a bar
 * that compares the row. A larger set has a row for each country (`StandingsTable`).
 * The columns are in the order of the open mode, or of the row that sorts them. In each row the best rank has more weight and only the leader's
 * bar is bright. When two countries share the best rank, their cells have a tie mark.
 * The columns stay near the labels in a wide frame, and the rules go across the
 * full width. The table scrolls sideways only when the frame cannot give each
 * column its smallest width.
 */
export function CompareLevel() {
  const selected = useSelectedCountries();
  useFrameOnOpen();
  const mode = useEu5MapMode();
  const wide = useBreakpoint("md");
  const ranking = useRanking(mode);
  const order = (ranking?.rows ?? []).flatMap((r) => (r.country ? [r.country.country.key] : []));
  const keys = selected.map((c) => c.country.key);
  // Each country of the set is shown. Columns fit a few, and a table has a row for each.
  const table = keys.length > COMPARE_MAX;
  const shown = table ? keys : compareColumns(keys, order, COMPARE_MAX);
  const standings = useStandings(shown);
  const full = useFullView().on;
  const [sortBy, setSortBy] = useState<string | null>(null);

  // While new profiles load, the table keeps the countries that are still shown.
  const loaded = (standings ?? []).filter((x) => shown.includes(x.countryIdx));
  const sortFigure = OVERVIEW.flatMap((g) => g.figures).find((f) => f.label === sortBy);
  const columns: Column[] = sortFigure
    ? [...loaded].sort(
        (a, b) => sortFigure.amount(b.profile.overview) - sortFigure.amount(a.profile.overview),
      )
    : [...loaded].sort((a, b) => shown.indexOf(a.countryIdx) - shown.indexOf(b.countryIdx));

  if (selected.length < 2) return <Note>Select two countries or more</Note>;
  if (columns.length === 0) return <ProfileSkeleton />;

  const finding = standingsLine(columns);
  if (selected.length > STANDINGS_MAX) {
    return (
      <Note>
        {formatInt(selected.length)} countries is too many to set side by side. The Summary and the
        data tab give this selection as totals and distributions.
      </Note>
    );
  }
  if (table) {
    return (
      <>
        {finding ? <Finding>{finding}</Finding> : null}
        <p className="px-3.5 py-1.5 text-[12px] text-game-ink-500">
          Bold: top of the column. The sorted column also has the world rank. A click on a column
          sorts the rows.
        </p>
        <StandingsAndRace rows={columns} />
      </>
    );
  }

  const n = columns.length;
  const grid: React.CSSProperties = {
    gridTemplateColumns: wide
      ? `minmax(${LABEL_MIN}px, ${LABEL_MAX}px) repeat(${n}, minmax(${COLUMN_MIN}px, 1fr))`
      : `repeat(${n}, minmax(${PHONE_COLUMN_MIN}px, 1fr))`,
  };
  const frame: React.CSSProperties = {
    minWidth: (wide ? LABEL_MIN + n * COLUMN_MIN : n * PHONE_COLUMN_MIN) + PADDING + 8,
  };

  return (
    <>
      {finding ? <Finding>{finding}</Finding> : null}
      <p className="px-3.5 py-1.5 text-[12px] text-game-ink-500">
        Bar: size of the value, orange under zero. Bold: row leader. <MapGlyph />: show on map.
        <SortMark sorted="desc" />: sort the countries by this row.
      </p>
      <div
        className={cx(
          "@container",
          full ? "grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start gap-2" : undefined,
        )}
      >
        <div className="min-w-0">
          <div className="flex justify-end px-3.5 pb-1">
            <StandingsImageButton
              rows={columns}
              figures={OVERVIEW.flatMap((g) => g.figures).filter((f) => f.rank)}
              tab="Each metric"
              headline={finding}
            />
          </div>
          <div tabIndex={0} className={cx("overflow-x-auto", focusRingInset)}>
            <div role="table" aria-label="Selected countries" style={frame}>
              <div role="row" className={headClass} style={grid}>
                <span role="columnheader" className={cx(labelCellClass, "max-md:hidden")} />
                {columns.map((x) => (
                  <CountryHead key={x.countryIdx} column={x} />
                ))}
              </div>
              {OVERVIEW.map(({ section, figures }, i) => (
                <div key={section} role="rowgroup">
                  <Band label={section} flush={i === 0} />
                  {figures.map((figure) => (
                    <FigureRow
                      key={figure.label}
                      figure={figure}
                      columns={columns}
                      grid={grid}
                      sorted={sortBy === figure.label}
                      onSort={() => setSortBy(sortBy === figure.label ? null : figure.label)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <RaceChart rows={columns} />
      </div>
    </>
  );
}

/** The last cell's own padding and this inset end the table on the 14px gutter. */
const rowBase = "grid items-center border-b pr-2 pl-3.5";
const headClass = `${rowBase} min-h-[30px] border-game-line max-md:min-h-11`;
/** A rule on the left of each country's column keeps its value and rank apart from the next column */
const cellClass =
  "flex flex-col items-stretch justify-center gap-0.5 self-stretch border-l border-game-line px-1.5 whitespace-nowrap md:gap-0 md:pb-0.5";
/** A row of 36px, so that a cell's bar stands with its value and away from the rule */
const rowClass = `${rowBase} h-9 border-game-line-faint max-md:h-auto max-md:pb-1.5`;
/**
 * The first column stays when the table scrolls sideways. Its opaque ground
 * covers the values under it and the inset of the row. On a phone the label is on
 * its own line over the row, and it stays when the table scrolls.
 */
const labelCellClass =
  "sticky left-0 z-10 -ml-3.5 flex items-center self-stretch border-r border-game-line bg-game-panel pl-3.5 max-md:left-3.5 max-md:col-span-full max-md:ml-0 max-md:h-6 max-md:w-fit max-md:border-r-0 max-md:bg-transparent max-md:pl-0";

/** The head of a country's column: its swatch and tag. A click opens its profile. */
function CountryHead({ column }: { column: Column }) {
  const openCountry = useOpenCountry();
  const players = useEu5Players();
  const { header } = column.profile;
  const isPlayer = players.some((x) => x.countryIdx === column.countryIdx);
  const you = isPlayer && players.length === 1;
  const player = usePlayerName(column.countryIdx);
  const wide = useBreakpoint("md");

  return (
    <span
      role="columnheader"
      className="flex flex-wrap items-center justify-end self-stretch border-l border-game-line px-1.5 whitespace-nowrap max-md:justify-start"
    >
      <button
        type="button"
        title={isPlayer ? `${header.name} (player)` : header.name}
        onClick={() =>
          openCountry({
            idx: column.countryIdx,
            name: header.name,
            anchor: header.anchorLocationIdx,
          })
        }
        className={cx(
          "flex h-6 items-center gap-1.5 rounded-control px-1.5 transition-colors hover:bg-game-panel-hover max-md:h-11 max-md:min-w-11 max-md:px-0 md:-mr-1.5",
          focusRing,
        )}
      >
        <Swatch color={header.colorHex} size={10} />
        <span className="font-game-ui text-[12px] text-game-ink-100 max-md:text-left max-md:leading-tight max-md:whitespace-normal">
          {wide ? header.name : (displayTag(header.tag) ?? header.name)}
        </span>
      </button>
      {/* In a multiplayer save each column can be a player, so its human has the name. */}
      {player ? (
        <span className="w-full text-right font-game-ui text-[12px] leading-tight break-words text-game-ink-300">
          {player}
        </span>
      ) : null}
      {you && !player ? <PlayerTag className="ml-0.5" /> : null}
    </span>
  );
}

/** The width must rest this long before the map frames in the free part */
const SETTLE_MS = 300;

/**
 * Opening Compare asks to see these countries together, so the map frames them
 * beside the table. The width of the column glides, and the time of that glide
 * depends on the machine, so the frame follows the width while the level is open. A
 * reader who pans the map keeps the view until the width changes. A phone has the
 * sheet over the map, and an expanded level has the map as an inset.
 */
function useFrameOnOpen() {
  const frameSelection = useFrameSelection();
  const { left } = useViewportInsets();
  const wide = useBreakpoint("md");
  // Also when a country joins from the map, so that each selected country is in view.
  const count = useSelectedCountries().length;
  useEffect(() => {
    if (!wide || left >= window.innerWidth - 1) return;
    const timer = setTimeout(frameSelection, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [frameSelection, left, wide, count]);
}

/** One figure across the selected countries */
function FigureRow({
  figure,
  columns,
  grid,
  sorted,
  onSort,
}: {
  figure: OverviewFigure;
  columns: readonly Column[];
  grid: React.CSSProperties;
  sorted: boolean;
  onSort: () => void;
}) {
  const texts = columnText(figure, columns);
  const ranks = columns.map((x) => figure.rank?.(x.profile.overview));
  // One column has nothing to be better than, and a tie has no best.
  const best = bestRank(ranks);
  const tied = bestIsTied(ranks);
  const lowest = Math.min(...ranks.map((r) => r ?? Infinity));
  const amounts = columns.map((x) => figure.amount(x.profile.overview));
  // One scale for each row, and a value under zero goes to the left of the zero line.
  const { zero, bars } = compareBars(amounts);

  return (
    <div role="row" className={rowClass} style={grid}>
      <span role="rowheader" className={labelCellClass}>
        {figure.tooltip ? (
          <Tooltip>
            <Tooltip.Trigger asChild>
              <span
                tabIndex={0}
                className={cx(
                  "mr-2 rounded-[1px] font-game-ui text-[12px] text-game-ink-100",
                  glossaryTerm,
                  focusRing,
                )}
              >
                {figure.mode ? (
                  <MapModeLabel mode={figure.mode} label={figure.label} />
                ) : (
                  figure.label
                )}
              </span>
            </Tooltip.Trigger>
            <Tooltip.Content side="right" className="max-w-72 text-xs">
              {figure.tooltip}
            </Tooltip.Content>
          </Tooltip>
        ) : figure.mode ? (
          <span className="pr-2">
            <MapModeLabel mode={figure.mode} label={figure.label} />
          </span>
        ) : (
          <span className="truncate pr-2 font-game-ui text-[12px] text-game-ink-100">
            {figure.label}
          </span>
        )}
        <button
          type="button"
          onClick={onSort}
          aria-pressed={sorted}
          aria-label={`Sort the countries by ${figure.label}`}
          className={cx(
            "mr-1 ml-auto grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[2px] text-game-ink-500 hover:text-game-ink-100 max-md:hidden",
            sorted && "text-game-ink-100",
            focusRing,
          )}
        >
          <SortMark sorted={sorted ? "desc" : false} />
        </button>
      </span>
      {columns.map((x, i) => {
        const rank = ranks[i];
        const top = best !== undefined && rank === best;
        // A rank that other countries of the world share has the tie mark.
        const worldTied = figure.tied?.(x.profile.overview) ?? 1;
        const tie = (tied && rank === lowest) || worldTied > 1;
        const leader = top || (tied && rank === lowest);
        const amount = amounts[i];
        const value = texts[i];
        const bar = bars[i];
        // A value under zero has the colour of a shortage, so a longer bar does not read as more.
        const negative = amount < 0;
        return (
          <span key={x.countryIdx} role="cell" className={cellClass}>
            <span
              className={cx(
                "flex items-baseline justify-end max-md:flex-col max-md:items-end max-md:gap-0",
                "gap-2",
              )}
            >
              <ExactValue
                exact={formatExact(amount)}
                shown={value}
                className={cx(
                  "font-game-num text-[12.5px] tabular-nums max-md:leading-tight",
                  top ? "font-medium text-game-ink-100" : "text-game-ink-300",
                )}
              >
                <Figure>{value}</Figure>
              </ExactValue>
              {rank === undefined ? (
                <IconTip side="top" label="The game ranks no country by this">
                  <span className="min-w-[4ch] shrink-0 text-right font-game-num text-[12px] text-game-ink-500 max-md:leading-tight">
                    —
                  </span>
                </IconTip>
              ) : (
                <span
                  title={
                    worldTied > 1 ? `${formatInt(worldTied)} countries share this rank` : undefined
                  }
                  className={cx(
                    "min-w-[4ch] shrink-0 text-right font-game-num text-[12px] tabular-nums max-md:leading-tight",
                    tie ? "text-game-ink-100" : "text-game-ink-300",
                  )}
                >
                  {tie ? `=${formatRank(rank)}` : formatRank(rank)}
                </span>
              )}
            </span>
            <span aria-hidden className="relative block h-[5px] rounded-[1px] bg-game-track">
              {bar.width > 0 ? (
                <span
                  className={cx(
                    "absolute inset-y-0 rounded-[1px]",
                    !negative && (leader ? "bg-game-ink-100" : "bg-game-ink-300"),
                  )}
                  style={{
                    left: `${bar.left * 100}%`,
                    width: `${bar.width * 100}%`,
                    minWidth: 2,
                    background: negative ? divergingPoles.warm : undefined,
                  }}
                />
              ) : null}
              {/* A row that can go under zero shows where zero is. */}
              {figure.signed ? (
                <span
                  className="absolute -top-0.5 h-[9px] w-px bg-game-ink-100"
                  style={{ left: `${zero * 100}%` }}
                />
              ) : null}
            </span>
          </span>
        );
      })}
    </div>
  );
}
