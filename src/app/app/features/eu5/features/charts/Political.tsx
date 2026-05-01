import type React from "react";
import { UserIcon } from "@heroicons/react/20/solid";
import { cx } from "class-variance-authority";
import { Tooltip } from "@/components/Tooltip";
import type { PoliticalWorldRow } from "@/wasm/wasm_eu5";
import { formatFloat, formatInt } from "@/lib/format";
import { useEu5SelectionTrigger } from "../../EntityProfile/useEu5Trigger";
import { countryProfileEntry, usePanelNav } from "../../EntityProfile/PanelNavContext";
import { usePanToEntity } from "../../usePanToEntity";

const BACK_LABEL = "Overview";

export function PoliticalInsight() {
  const query = useEu5SelectionTrigger((engine) => engine.trigger.getPoliticalWorldScoreboard());
  const rows = query.data?.rows ?? [];

  if (query.loading && !query.data) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className="h-10 animate-pulse rounded bg-white/5" />
        <div className="h-11 animate-pulse rounded bg-white/5" />
        <div className="h-11 animate-pulse rounded bg-white/5" />
        <div className="h-11 animate-pulse rounded bg-white/5" />
        <div className="h-11 animate-pulse rounded bg-white/5" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-slate-500">
        No great powers in this selection.
      </div>
    );
  }

  return <PoliticalWorldScoreboard rows={rows} />;
}

function PoliticalWorldScoreboard({ rows }: { rows: PoliticalWorldRow[] }) {
  const nav = usePanelNav();
  const panToEntity = usePanToEntity();
  let hasRenderedSeparator = false;

  const handleClick = (row: PoliticalWorldRow) => {
    nav.pushMany([countryProfileEntry(row.anchorLocationIdx, row.name)], BACK_LABEL);
    panToEntity(row.anchorLocationIdx);
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <div>
        <p className="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
          Great Powers
        </p>
        <h2 className="text-base font-semibold text-slate-100">Political World Scoreboard</h2>
      </div>

      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_5.25rem_5.25rem_5.25rem_5.25rem] items-center gap-2 border-b border-white/10 px-2 pb-2 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
        <span>Rank</span>
        <span>Country</span>
        <HeaderCell tooltip="Effective Development: sum of control x development across selected owned locations.">
          Eff. Dev
        </HeaderCell>
        <HeaderCell tooltip="Active State Capacity: sum of population x control x development across selected owned locations. Displayed in millions.">
          Active Cap
        </HeaderCell>
        <HeaderCell tooltip="Total population across selected owned locations.">Pop</HeaderCell>
        <HeaderCell tooltip="Estimated monthly tax plus trade income from the country.">
          Income
        </HeaderCell>
      </div>

      <div className="flex flex-col gap-1">
        {rows.map((row) => {
          const showSeparator = row.ordinalRank > 10 && !hasRenderedSeparator;
          if (showSeparator) {
            hasRenderedSeparator = true;
          }

          return (
            <div key={`${row.tag}-${row.ordinalRank}`}>
              {showSeparator && (
                <div className="my-2 flex items-center gap-3 text-[10px] font-semibold tracking-wider text-amber-200/80 uppercase">
                  <span className="h-px flex-1 bg-amber-200/20" />
                  <span>Players outside top 10</span>
                  <span className="h-px flex-1 bg-amber-200/20" />
                </div>
              )}
              <button
                type="button"
                onClick={() => handleClick(row)}
                className={cx(
                  "grid w-full grid-cols-[4.5rem_minmax(0,1fr)_5.25rem_5.25rem_5.25rem_5.25rem] items-center gap-2 rounded border border-white/10 bg-white/3 px-2 py-2 text-left transition hover:border-sky-300/40 hover:bg-sky-300/10",
                  row.isPlayer && "border-amber-300/25 bg-amber-300/10 hover:bg-amber-300/15",
                )}
                style={{ borderLeftColor: row.colorHex, borderLeftWidth: 4 }}
              >
                <span className="inline-flex h-7 w-12 items-center justify-center rounded bg-white/10 font-mono text-xs font-semibold text-slate-100">
                  #{formatInt(row.ordinalRank)}
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                    {row.isPlayer && <UserIcon className="h-3.5 w-3.5 shrink-0 text-amber-300" />}
                  </span>
                  <span
                    className="h-4 w-4 shrink-0 rounded-sm"
                    style={{ backgroundColor: row.colorHex }}
                  />
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="font-mono text-[10px] text-slate-500">{row.tag}</span>
                      <span className="truncate text-sm font-medium text-slate-100">
                        {row.name}
                      </span>
                    </span>
                  </span>
                </span>
                <ScoreCell>{formatFloat(row.totalStateEfficacy, 1)}</ScoreCell>
                <ScoreCell>{formatFloat(row.activeStateCapacity / 1000000, 1)}</ScoreCell>
                <ScoreCell>{formatInt(row.totalPopulation)}</ScoreCell>
                <ScoreCell>{formatFloat(row.taxTradeIncome, 2)}</ScoreCell>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScoreCell({ children }: { children: React.ReactNode }) {
  return (
    <span className="min-w-0 truncate text-right font-mono text-xs text-slate-200">{children}</span>
  );
}

function HeaderCell({ children, tooltip }: { children: React.ReactNode; tooltip: string }) {
  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <span className="cursor-help text-right decoration-dotted underline-offset-2 hover:text-slate-300 hover:underline">
          {children}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Content side="top" className="max-w-72 text-xs normal-case">
        {tooltip}
      </Tooltip.Content>
    </Tooltip>
  );
}
