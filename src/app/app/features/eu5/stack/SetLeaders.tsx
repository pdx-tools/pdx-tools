import { cx } from "class-variance-authority";
import { focusRingInset } from "@/components/game/focusRing";
import { OVERVIEW } from "../features/profiles/country/EconomyTab";
import { compareEntry, usePanelNav } from "../features/profiles/PanelNavContext";
import { useEu5Trigger } from "../features/profiles/useEu5Trigger";
import { bestIsTied, displayTag } from "./selection";
import { useSelectedCountries } from "./selected";
import { Band, RowChevron, Swatch, rowClass, rowColumns } from "./parts";

/** More countries than this are for Compare, because each one asks for its whole profile. */
const MOST_COUNTRIES = 8;

/**
 * Who leads what, under the ranking of a set of countries. In 340px the set has no
 * room for a column per country, and this answers the question that a set asks. A
 * row opens Compare, which has all the values.
 */
export function SetLeaders() {
  const selected = useSelectedCountries();
  const nav = usePanelNav();
  const keys = selected.map((c) => c.country.key);
  const shown = keys.length <= MOST_COUNTRIES ? keys : [];
  const { data } = useEu5Trigger(
    (engine) => Promise.all(shown.map((idx) => engine.queries.getCountryProfile(idx))),
    [shown.join(",")],
  );
  const profiles = (data ?? []).flatMap((p) => (p ? [p] : []));
  if (profiles.length < 2) return null;

  const rows = OVERVIEW.flatMap(({ figures }) => figures).flatMap((figure) => {
    const rank = figure.rank;
    if (!rank) return [];
    const ranks = profiles.map((p) => rank(p.overview));
    const best = profiles[ranks.indexOf(Math.min(...ranks))];
    // The same rule as Compare: a tie has no leader.
    const tied = bestIsTied(ranks) ? ranks.filter((r) => r === Math.min(...ranks)).length : 0;
    return [{ figure, best, tied }];
  });

  return (
    <>
      <Band label="Who leads" columns="Value" flush />
      {rows.map(({ figure, best, tied }) => (
        <button
          key={figure.label}
          type="button"
          onClick={() => nav.open(compareEntry)}
          style={{ gridTemplateColumns: rowColumns({ flush: true, bar: true, value: true }) }}
          className={cx(rowClass, "group cursor-pointer hover:bg-game-panel-hover", focusRingInset)}
        >
          <span className="min-w-0 text-[12px] text-game-ink-100">{figure.label}</span>
          <span className="flex items-center gap-1.5">
            {tied > 0 ? (
              <span className="font-game-ui text-[12px] text-game-ink-300">Tie ({tied})</span>
            ) : (
              <>
                <Swatch color={best.header.colorHex} size={8} />
                <span className="font-game-ui text-[12px] text-game-ink-300">
                  {displayTag(best.header.tag) ?? best.header.name}
                </span>
              </>
            )}
          </span>
          <span className="text-right font-game-num text-[12px] font-medium text-game-ink-100 tabular-nums">
            {figure.value(best.overview)}
          </span>
          <RowChevron className="[@media(hover:hover)]:text-game-ink-500" />
        </button>
      ))}
    </>
  );
}
