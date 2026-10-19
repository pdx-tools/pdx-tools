import React, { useCallback, useMemo, useState } from "react";
import { cx } from "class-variance-authority";
import { GameButton, focusRingAlways } from "@/components/game";
import { Band, LevelTitle, Note } from "@/features/stack";
import { useHoi4Worker } from "../hooks/useHoi4Worker";
import { useWorld } from "./context";

const fmt = (x: number) => String(+x.toFixed(3));

/**
 * The country's script variables as the save writes them. Their meaning
 * depends on the focus tree and the mods, so they are listed, not read.
 */
export function VariablesLevel({ tag }: { tag: string }) {
  const world = useWorld();
  const [filter, setFilter] = useState("");
  const [copied, setCopied] = useState(false);
  const { data, error } = useHoi4Worker(useCallback((worker) => worker.countryDetails(tag), [tag]));

  const json = useMemo(() => {
    if (!data) return null;
    return JSON.stringify(
      {
        stability: data.stability,
        warSupport: data.warSupport,
        variableCategories: Object.fromEntries(
          [...data.variableCategories.entries()]
            .map(([k, v]) => [k, v.map((x) => +x.toFixed(3))])
            .sort(),
        ),
        variables: Object.fromEntries(
          [...data.variables.entries()].map(([k, v]) => [k, +v.toFixed(3)]).sort(),
        ),
      },
      null,
      2,
    );
  }, [data]);

  const search = filter.trim().toLowerCase();
  const match = (key: string) => !search || key.toLowerCase().includes(search);
  const categories = data
    ? [...data.variableCategories.entries()]
        .filter(([k]) => match(k))
        .sort(([a], [b]) => a.localeCompare(b))
    : [];
  const variables = data
    ? [...data.variables.entries()]
        .filter(([k]) => match(k) && !k.includes("^"))
        .sort(([a], [b]) => a.localeCompare(b))
    : [];

  return (
    <>
      <LevelTitle
        swatch={world.color(tag)}
        title={`${world.name(tag)}: save variables`}
        aside={
          json ? (
            <GameButton
              variant="ghost"
              className="px-2"
              onClick={() => {
                void navigator.clipboard.writeText(json).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                });
              }}
            >
              {copied ? "Copied" : "Copy as JSON"}
            </GameButton>
          ) : null
        }
      />
      <Note>
        Script variables from the focus tree, events, and mods. The game shows none of them.
      </Note>
      <div className="border-b border-game-line px-3.5 py-2">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name"
          aria-label="Filter variables by name"
          className={cx(
            "h-7 w-full rounded-[var(--radius-control)] border border-game-line bg-game-page px-2.5 text-[12.5px] text-game-ink-100 placeholder:text-game-ink-500",
            focusRingAlways,
          )}
        />
      </div>
      {error ? <Note>The variables could not be read: {error}</Note> : null}
      {!data && !error ? <Note>Reading the variables…</Note> : null}
      {data && categories.length + variables.length === 0 ? (
        <Note>{search ? "No variable matches the filter." : "This country has no variables."}</Note>
      ) : null}
      {categories.length ? (
        <>
          <Band label="Arrays" columns={`${categories.length}`} />
          {categories.map(([key, values]) => (
            <div
              key={key}
              className="grid gap-1 border-b border-game-line px-3.5 py-1.5 font-game-num text-[11px]"
            >
              <span className="break-all text-game-ink-300">
                {key} <span className="text-game-ink-500">· {values.length}</span>
              </span>
              <span className="[overflow-wrap:anywhere] text-game-ink-100 tabular-nums">
                {values.map(fmt).join("  ")}
              </span>
            </div>
          ))}
        </>
      ) : null}
      {variables.length ? (
        <>
          <Band label="Variables" columns={`${variables.length}`} />
          {variables.map(([key, value]) => (
            <VariableLine key={key} name={key} value={fmt(value)} />
          ))}
        </>
      ) : null}
    </>
  );
}

function VariableLine({ name, value }: { name: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-b border-game-line px-3.5 py-1 font-game-num text-[11px]">
      <span className="break-all text-game-ink-300">{name}</span>
      <span className="max-w-[140px] text-right break-all text-game-ink-100 tabular-nums">
        {value}
      </span>
    </div>
  );
}
