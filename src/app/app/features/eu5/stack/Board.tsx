import { useMemo, useState } from "react";
import { cx } from "class-variance-authority";
import { focusRing } from "@/components/game/focusRing";
import { sectionLabel } from "@/components/game/SectionTitle";
import { formatLongDate } from "@/features/timeline/date";
import { formatCompactIn, formatInt, formatMetric } from "@/lib/format";
import type { CountryRef, PoliticalWorldRow } from "@/wasm/wasm_eu5";
import { GameButton } from "../components";
import { SortMark } from "../components/Eu5DataTable";
import { compareEntry, usePanelNav } from "../features/profiles/PanelNavContext";
import { useEu5SelectionTrigger } from "../features/profiles/useEu5Trigger";
import {
  useEu5Engine,
  useEu5HomeCountry,
  useEu5Players,
  useEu5SelectionState,
  useEu5TimelineMapDate,
} from "../store";
import { RankRow, countryRow, moveAmongRows } from "./ModeRanking";
import { useFrameSelection } from "./frameSelection";
import { Figure, rowEnd } from "./parts";
import { displayTag, formatScore, isCountrySet, rankLabel } from "./selection";

type Column = {
  id: "rank" | "score" | "income" | "effDev";
  label: string;
  /** The sort order that a first click gives */
  first: "asc" | "desc";
  value: (row: PoliticalWorldRow) => number;
};

const COLUMNS: readonly Column[] = [
  { id: "rank", label: "Rank", first: "asc", value: (r) => r.ordinalRank },
  { id: "score", label: "Score", first: "desc", value: (r) => r.greatPowerPoints },
  { id: "income", label: "Income", first: "desc", value: (r) => r.income },
  { id: "effDev", label: "Eff. Dev", first: "desc", value: (r) => r.totalStateEfficacy },
];

const BOARD_COLUMNS = "16px minmax(0,1fr) 36px 40px 50px 58px";

/** One line that says who leads the group, from the rows of the board */
function boardLine(rows: readonly PoliticalWorldRow[]): string | null {
  if (rows.length < 2) return null;
  // The save keeps a record for each person who ever joined, so the rows say who plays now.
  const players = rows.filter((row) => row.country.isPlayer).length;
  const byScore = [...rows].sort((a, b) => b.greatPowerPoints - a.greatPowerPoints);
  const byIncome = [...rows].sort((a, b) => b.income - a.income);
  const leader = byScore[0];
  const count = players > 1 ? `${formatInt(players)} players. ` : "";
  const score =
    byScore[1] && leader.greatPowerPoints === byScore[1].greatPowerPoints
      ? `${leader.country.country.name} and ${byScore[1].country.country.name} share the lead on score, with ${formatScore(leader.greatPowerPoints)}.`
      : `${leader.country.country.name} leads on score with ${formatScore(leader.greatPowerPoints)}.`;
  const earner = byIncome[0];
  const income =
    earner.country.country.key === leader.country.country.key
      ? ` It also has the top income.`
      : ` ${earner.country.country.name} has the top income, ${formatMetric(earner.income)}.`;
  return `${count}${score}${income}`;
}

/**
 * The great powers and the players, as a table that can be sorted. In a multiplayer
 * save this is the first thing that the group wants: who is ahead, on what, with
 * each player's name on the row.
 */
export function GreatPowerBoard() {
  const query = useEu5SelectionTrigger((engine) => engine.queries.getPoliticalWorldScoreboard());
  const players = useEu5Players();
  const selection = useEu5SelectionState();
  const engine = useEu5Engine();
  const nav = usePanelNav();
  const home = useEu5HomeCountry();
  const [sort, setSort] = useState<{ id: Column["id"]; direction: "asc" | "desc" }>({
    id: "rank",
    direction: "asc",
  });

  const rows = useMemo(() => {
    const column = COLUMNS.find((c) => c.id === sort.id) ?? COLUMNS[0];
    const sign = sort.direction === "asc" ? 1 : -1;
    return [...(query.data?.rows ?? [])].sort((a, b) => sign * (column.value(a) - column.value(b)));
  }, [query.data, sort]);

  if (!query.data) return null;
  const largest = {
    income: Math.max(...rows.map((r) => Math.abs(r.income))),
    effDev: Math.max(...rows.map((r) => r.totalStateEfficacy)),
  };
  const multiplayer = players.length > 1;
  const line = boardLine(rows);
  const playing = rows.filter((row) => row.country.isPlayer).length;
  const canCompare = multiplayer && (!isCountrySet(selection) || selection?.preset === "players");

  return (
    <>
      {line ? (
        <p className="px-3.5 pb-2 text-[12px] leading-snug text-game-ink-300">{line}</p>
      ) : null}
      {canCompare ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 pb-2.5">
          <GameButton
            onClick={() =>
              void (
                selection?.preset === "players"
                  ? Promise.resolve()
                  : engine.commands.selectPlayers()
              ).then(() => nav.open(compareEntry))
            }
          >
            Compare {formatInt(playing)} players on each metric
          </GameButton>
          {home ? null : (
            <span className="text-[12px] leading-tight text-game-ink-500">
              Select your country to mark it as yours.
            </span>
          )}
        </div>
      ) : null}
      {!multiplayer && rows.length > 1 ? (
        <div className="px-3.5 pb-2.5">
          <GameButton
            onClick={() =>
              void engine.commands
                .selectCountries(rows.map((row) => row.country.country.key))
                .then(() => nav.open(compareEntry))
            }
          >
            Compare these {formatInt(rows.length)} on each metric
          </GameButton>
        </div>
      ) : null}
      <div aria-label="Great powers and players">
        <div
          className={cx(rowEnd, "grid h-7 items-center gap-2 bg-game-panel-2 pl-3.5 max-md:h-11")}
          style={{ gridTemplateColumns: BOARD_COLUMNS }}
        >
          <span className={cx(sectionLabel, "col-span-2")}>Countries</span>
          {COLUMNS.map((column) => {
            const on = sort.id === column.id;
            return (
              <span key={column.id} className="flex justify-end">
                <button
                  type="button"
                  aria-label={`Sort by ${column.label}${on ? `, ${sort.direction === "asc" ? "lowest first" : "highest first"}` : ""}`}
                  onClick={() =>
                    setSort(
                      on
                        ? { id: column.id, direction: sort.direction === "asc" ? "desc" : "asc" }
                        : { id: column.id, direction: column.first },
                    )
                  }
                  className={cx(
                    sectionLabel,
                    "relative inline-flex cursor-pointer items-center gap-0.5 rounded-[2px] whitespace-nowrap before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] hover:text-game-ink-100 max-md:min-h-11",
                    on && "text-game-ink-100",
                    focusRing,
                  )}
                >
                  {column.label}
                  {on ? <SortMark sorted={sort.direction} /> : null}
                </button>
              </span>
            );
          })}
        </div>
        <div onKeyDown={moveAmongRows}>
          {rows.map((row, index) => (
            <BoardRow
              key={row.country.country.key}
              row={row}
              largest={largest}
              first={index === 0}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function BoardRow({
  row,
  largest,
  first,
}: {
  row: PoliticalWorldRow;
  largest: { income: number; effDev: number };
  first: boolean;
}) {
  const ranked = {
    ...countryRow(row.country, row.greatPowerPoints),
    rank: row.ordinalRank,
    rankTied: row.ordinalTied,
  };
  const number = "text-right font-game-num text-[12.5px] whitespace-nowrap tabular-nums";
  return (
    <RankRow
      row={ranked}
      display={formatScore(row.greatPowerPoints)}
      gridColumns={BOARD_COLUMNS}
      first={first}
      cells={
        <>
          <span className={cx(number, "text-game-ink-300")}>
            {rankLabel(row.ordinalRank, row.ordinalTied)}
          </span>
          <span className={cx(number, "font-medium text-game-ink-100")}>
            <Figure>{formatScore(row.greatPowerPoints)}</Figure>
          </span>
          <span className={cx(number, "text-game-ink-300")}>
            <Figure>{formatCompactIn(row.income, largest.income)}</Figure>
          </span>
          <span className={cx(number, "text-game-ink-300")}>
            <Figure>{formatCompactIn(row.totalStateEfficacy, largest.effDev)}</Figure>
          </span>
        </>
      }
    />
  );
}

/**
 * Political at a past date: the ownership history of the save tells who held how much
 * land on that date, and nothing else about it. So this list follows the
 * map, and it says what the other figures are.
 */
export function DatedBoard() {
  const date = useEu5TimelineMapDate();
  const home = useEu5HomeCountry();
  const engine = useEu5Engine();
  const frame = useFrameSelection();
  const include = home?.countryIdx;
  const { data } = useEu5SelectionTrigger(
    (e) => e.queries.getDatedRealms(include),
    [date.year, date.month, date.day, include],
  );
  if (!data) return null;
  const largest = Math.max(1, ...data.rows.map((r) => r.locations));

  return (
    <>
      <div className="flex items-start gap-3 px-3.5 pt-3 pb-1">
        <h2 className="min-w-0 flex-1 text-[17px] leading-tight font-medium text-game-ink-100">
          Largest realms on {formatLongDate(date)}
        </h2>
      </div>
      <p className="px-3.5 pb-2 text-[12px] leading-snug text-game-ink-300">
        {formatInt(data.countryCount)} countries own land on this date. The save keeps only who
        owned what, so scores and economy exist for the save date only.
      </p>
      <div
        className={cx(rowEnd, "grid h-7 items-center gap-2.5 bg-game-panel-2 pl-3.5")}
        style={{ gridTemplateColumns: "16px minmax(0,1fr) 64px 48px 56px" }}
      >
        <span className={cx(sectionLabel, "col-span-3")}>Countries</span>
        <span className={cx(sectionLabel, "text-right")}>Land</span>
        <span className={cx(sectionLabel, "text-right")} title="Land on the save date">
          At save
        </span>
      </div>
      {data.rows.map((row) => {
        const country: CountryRef | undefined = row.country;
        const content = (
          <>
            <span
              aria-hidden
              className="h-3 w-3 rounded-[2px] shadow-[inset_0_0_0_1px_var(--game-rim)]"
              style={{ background: row.colorHex }}
            />
            <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13px] leading-tight text-game-ink-100">
              {row.name}
              {displayTag(row.tag) ? (
                <span className="font-game-ui text-[12px] text-game-ink-500">{row.tag}</span>
              ) : null}
            </span>
            <span aria-hidden className="h-1.5 overflow-hidden rounded-[2px] bg-game-track">
              <span
                className="block h-full rounded-[1px] bg-game-ink-300"
                style={{ width: `${(row.locations / largest) * 100}%`, minWidth: 2 }}
              />
            </span>
            <span className="text-right font-game-num text-[13px] font-medium text-game-ink-100 tabular-nums">
              {formatInt(row.locations)}
            </span>
            <span className="text-right font-game-num text-[12px] text-game-ink-500 tabular-nums">
              {row.locationsAtSave > 0 ? formatInt(row.locationsAtSave) : "none"}
            </span>
          </>
        );
        const style = { gridTemplateColumns: "16px minmax(0,1fr) 64px 48px 56px" };
        const rowCss =
          "relative grid min-h-[30px] w-full items-center gap-2.5 border-b border-game-line-faint pr-8 pl-3.5 text-left max-md:min-h-11 max-md:pr-11";
        return country ? (
          <button
            key={`${row.name}-${row.tag}`}
            type="button"
            style={style}
            onClick={() => void engine.commands.selectCountry(country.country.key).then(frame)}
            className={cx(rowCss, "cursor-pointer hover:bg-game-panel-hover", focusRing)}
          >
            {content}
          </button>
        ) : (
          <div key={`${row.name}-${row.tag}`} style={style} className={rowCss}>
            {content}
          </div>
        );
      })}
    </>
  );
}
