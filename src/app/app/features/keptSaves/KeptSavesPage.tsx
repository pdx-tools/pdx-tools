import { useState } from "react";
import { Button } from "@/components/Button";
import { formatInt } from "@/lib/format";
import { useIsClient } from "@/hooks/useIsClient";
import type { FeedGame } from "@/server-lib/fn/feed";
import { SavesHeader } from "@/features/saves/SavesNav";
import { groupKept } from "./groupKept";
import { KeptCampaign } from "./KeptCampaign";
import { availableLimits, nextLimit, sizeOf, usedBytes, useKept } from "./keptStore";
import { watchStatus } from "./status";
import { supportsKeptSaves } from "./support";
import { formatBytes, savesText, UNSUPPORTED, UNSUPPORTED_HELP } from "./text";
import { GAMES } from "./types";
import { noteOpener, requestDelete } from "./ui";
import { MissedSaves, WatchRow } from "./WatchRow";
import { act, changeLimit } from "./watchService";

const notice = "border-2 px-4 py-2.5 text-sm text-gray-900";

export function KeptSavesPage({ game }: { game: FeedGame | undefined }) {
  const isClient = useIsClient();
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-5 md:p-9">
      <SavesHeader title="Kept saves" path="/saves/kept" game={game} />
      {isClient &&
        (supportsKeptSaves() ? (
          <KeptSaves key={game ?? "all"} game={game} />
        ) : (
          <p className={`${notice} border-sky-200 bg-sky-100`}>
            <strong className="block">{UNSUPPORTED}</strong>
            {UNSUPPORTED_HELP}
          </p>
        ))}
    </div>
  );
}

function KeptSaves({ game }: { game: FeedGame | undefined }) {
  // A change of a watch does not render the rows.
  const saves = useKept((state) => state.saves);
  const index = useKept((state) => state.index);
  const watches = useKept((state) => state.watches);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  if (saves === null) return null;

  const games = game ? [game] : GAMES;
  const groups = groupKept(saves, index, game);
  // A selected save can be deleted in another tab.
  const selected = groups.flatMap((group) => group.saves).filter((x) => selection.has(x.hash));
  const isNew = saves.length === 0 && Object.keys(watches).length === 0;
  const select = (hashes: readonly string[], checked: boolean) =>
    setSelection((current) => {
      const next = new Set(current);
      for (const hash of hashes) {
        if (checked) next.add(hash);
        else next.delete(hash);
      }
      return next;
    });

  return (
    <>
      {isNew && (
        <div className="max-w-prose">
          <p className="text-lg">Open a save again after the game has written over it.</p>
          <p className="mt-2 text-gray-600 dark:text-gray-300">
            Choose a game's save folder. While a PDX Tools tab is open, it can keep a copy of each
            save the game writes. Copies stay in this browser and are not uploaded.
          </p>
        </div>
      )}
      <div className="rounded-lg border border-gray-300 dark:border-gray-600">
        {games.map((x) => (
          <WatchRow key={x} game={x} />
        ))}
      </div>
      {isNew && (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          The browser asks for permission to view the folder. PDX Tools only reads it.
        </p>
      )}
      <LimitNotice />
      {games.map((x) => (
        <MissedSaves key={x} game={x} />
      ))}
      {saves.length > 0 && <Usage />}
      {groups.map((group) => (
        <KeptCampaign key={group.key} group={group} selected={selection} onSelect={select} />
      ))}
      {selected.length > 0 && (
        <div className="sticky bottom-5 flex flex-wrap items-center gap-3 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-slate-700">
          <p className="grow">
            <span className="text-base">
              {formatInt(selected.length)} selected, {formatBytes(sizeOf(selected))}
            </span>{" "}
            <span className="max-md:hidden">Shift and click selects a range</span>
          </p>
          <Button variant="ghost" onClick={() => setSelection(new Set())}>
            Clear
          </Button>
          <Button
            variant="danger"
            className="py-1.5"
            onClick={() => {
              noteOpener();
              requestDelete(selected);
            }}
          >
            Delete {savesText(selected.length)}
          </Button>
        </div>
      )}
    </>
  );
}

function LimitNotice() {
  const state = useKept();
  const isReached = GAMES.some((game) => watchStatus(game, state).kind === "limit");
  if (!isReached) return null;
  const next = nextLimit(state);
  return (
    <div className={`${notice} flex flex-wrap items-center gap-3 border-amber-200 bg-amber-100`}>
      <p className="grow basis-64">
        <strong>New saves are not being kept.</strong> Raise the limit or delete kept saves. Saves
        still in the folder are then kept.
      </p>
      {next !== undefined && (
        <Button
          className="py-1.5 dark:bg-white! dark:text-black!"
          onClick={() => act(changeLimit(next))}
        >
          Raise to {formatBytes(next)}
        </Button>
      )}
    </div>
  );
}

function Usage() {
  const state = useKept();
  const saves = state.saves ?? [];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600 dark:text-gray-300">
      <p className="grow basis-72">
        <span className="text-base text-black dark:text-white">
          {savesText(saves.length)}, {formatBytes(usedBytes(state))}
        </span>{" "}
        PDX Tools does not delete kept saves by itself.{" "}
        {state.storage?.persisted
          ? "The browser reports persistent storage; clearing site data deletes them."
          : "The browser reports that it may clear these copies if the disk is nearly full."}
      </p>
      <label className="flex items-center gap-2">
        Stop keeping at
        <select
          className="rounded-md border border-gray-400 bg-white px-2 py-1 text-black dark:border-gray-600 dark:bg-slate-700 dark:text-white"
          value={state.settings.limit}
          onChange={(event) => act(changeLimit(Number(event.currentTarget.value)))}
        >
          {availableLimits(state).map((limit) => (
            <option key={limit} value={limit}>
              {formatBytes(limit)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
