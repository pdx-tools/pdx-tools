import { useRef, useState } from "react";
import EllipsisVerticalIcon from "@heroicons/react/24/outline/EllipsisVerticalIcon";
import FolderOpenIcon from "@heroicons/react/24/outline/FolderOpenIcon";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { DropdownMenu } from "@/components/DropdownMenu";
import { GameMark } from "@/features/saves/saveDetails";
import type { CampaignGame } from "@/features/campaign/types";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { lastSize, latestOf, roomFor, useKept } from "./keptStore";
import { StartWatchForm } from "./StartWatchForm";
import { StatusIcon } from "./StatusIcon";
import { watchStatus } from "./status";
import { commitButton, pageMenuItem } from "./styles";
import {
  formatBytes,
  formatClock,
  formatPageDate,
  formatWhen,
  rejectedText,
  resumedText,
  roomText,
  savesText,
} from "./text";
import { otherGame, useWatchStart } from "./useWatchStart";
import {
  forgetWatch,
  resumeWatch,
  retryMissed,
  setKeep,
  stopWatch,
  takeWatch,
} from "./watchService";
import { noteOpener, returnFocus } from "./ui";

const GAME_FOLDERS = {
  eu4: "Usually Documents, Paradox Interactive, Europa Universalis IV, save games",
  eu5: "Usually Documents, Paradox Interactive, Europa Universalis V, save games",
};

/** The watch of one game, with the action that it needs now. */
export function WatchRow({ game, isPrimary = false }: { game: CampaignGame; isPrimary?: boolean }) {
  const state = useKept();
  const starter = useWatchStart();
  const [error, setError] = useState<string | null>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const config = state.watches[game];
  const live = state.live[game];
  const status = watchStatus(game, state);
  const label = game.toUpperCase();
  const run = (action: Promise<void>) => {
    setError(null);
    action.catch((failure) => setError(getErrorMessage(failure)));
  };
  const choose = () => {
    noteOpener(menu.current ?? document.activeElement);
    void starter.chooseFolder(game);
  };
  const commit = { variant: "primary", className: `${commitButton} py-1.5 text-sm` } as const;
  const plain = { className: "gap-2 py-1.5 text-sm" };

  let title = "Not watched";
  const also = otherGame(game) in state.watches ? " too" : "";
  let detail = state.saves?.length
    ? `Choose the save folder to keep ${label} saves${also}.`
    : GAME_FOLDERS[game];
  let action = (
    <Button {...plain} onClick={choose}>
      <FolderOpenIcon aria-hidden className="size-4" />
      Choose {label} folder
    </Button>
  );
  if (config !== undefined) {
    const name = `“${config.handle.name}”`;
    const write = latestOf(state.index, game);
    const last = write?.date
      ? `${[formatPageDate(write.date), write.countryName].filter(Boolean).join(", ")}, ${formatWhen(write.writtenAt)}`
      : null;
    const room = roomFor(state, lastSize(state.saves, game));
    action = (
      <Button {...plain} onClick={() => run(stopWatch(game))}>
        Stop watching
      </Button>
    );
    switch (status.kind) {
      case "no-access":
        title = `The browser no longer allows ${name}`;
        detail = `Nothing is being kept.${last ? ` Last write ${last}.` : ""}`;
        action = (
          <Button {...commit} onClick={() => run(resumeWatch(game))}>
            Allow access
          </Button>
        );
        break;
      case "not-found":
        title = `${name} was not found`;
        detail = "Moved, renamed or deleted. Kept saves are not affected.";
        action = (
          <Button {...commit} onClick={choose}>
            Choose {label} folder
          </Button>
        );
        break;
      case "paused": {
        title = `Watching ${name} is paused`;
        const keeping = config.keep ? "keeping copies" : "not keeping copies";
        detail =
          config.lastWatchedAt === null
            ? `Not watching, ${keeping}.`
            : `Last watched ${formatWhen(config.lastWatchedAt)}, ${keeping}.${live.phase === "paused" ? " The browser asks to view the folder again." : ""}`;
        action = (
          <Button {...(isPrimary ? commit : plain)} onClick={() => run(resumeWatch(game))}>
            Resume watching
          </Button>
        );
        break;
      }
      case "elsewhere":
        title = `Watching ${name} in another tab`;
        detail = "New saves show here. If that tab closes, this one takes over.";
        action = (
          <Button {...plain} onClick={() => takeWatch(game)}>
            Watch in this tab
          </Button>
        );
        break;
      case "limit":
        title = `Watching ${name}, not keeping`;
        detail = `The ${formatBytes(state.settings.limit)} limit is reached.${last ? ` Last write ${last}.` : ""}`;
        break;
      case "disk":
        title = `Watching ${name}, not keeping`;
        detail = "The disk is full.";
        break;
      default:
        title = `Watching ${name}, ${config.keep ? "keeping copies" : "not keeping"}`;
        detail = [
          last && `Last write ${last}.`,
          config.keep && room !== null && `Room for ${roomText(room, "more")}.`,
          status.kind === "near-limit" && "Raise the limit or delete some.",
        ]
          .filter(Boolean)
          .join(" ");
    }
    if (live.resumed !== null && live.since !== null && !status.isWarning) {
      title = `Watching ${name} again since ${formatClock(live.since)}`;
      detail = resumedText(live.resumed);
    }
    if (live.writing !== null) {
      detail = `The game is writing ${live.writing}.${config.keep ? " It is kept when it is complete." : ""}`;
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-300 px-4 py-3 last:border-b-0 sm:flex-nowrap dark:border-gray-600">
      <GameMark game={game} />
      <div className="min-w-0 grow basis-48 text-sm" aria-live="polite">
        <p className="flex items-start gap-2 font-semibold break-words">
          {config && <StatusIcon status={status} className="mt-0.5" />}
          <span className="min-w-0">{title}</span>
        </p>
        <p className="break-words text-gray-600 dark:text-gray-300">{detail}</p>
        {(error ?? starter.error) && (
          <p className="text-red-700 dark:text-red-400">{error ?? starter.error}</p>
        )}
      </div>
      {config && !config.keep && status.kind === "not-keeping" && (
        <Button {...plain} onClick={() => run(setKeep(game, true))}>
          Keep copies
        </Button>
      )}
      {action}
      {config && (
        <DropdownMenu>
          <DropdownMenu.Trigger asChild>
            <Button
              ref={menu}
              variant="ghost"
              shape="square"
              aria-label={`${label} watch settings`}
              className="rounded-md hover:bg-gray-200 dark:hover:bg-slate-700"
            >
              <EllipsisVerticalIcon aria-hidden className="size-4" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" className="w-48">
            <DropdownMenu.Item
              className={pageMenuItem}
              onSelect={() => run(setKeep(game, !config.keep))}
            >
              {config.keep ? "Stop keeping copies" : "Keep copies"}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={pageMenuItem} onSelect={choose}>
              Change folder
            </DropdownMenu.Item>
            <DropdownMenu.Item className={pageMenuItem} onSelect={() => run(forgetWatch(game))}>
              Forget folder
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      )}
      <Dialog open={starter.choice !== null} onOpenChange={(open) => !open && starter.cancel()}>
        {starter.choice && (
          <Dialog.Content
            onCloseAutoFocus={returnFocus}
            className="max-h-[90vh] overflow-y-auto text-sm"
            aria-describedby={undefined}
          >
            <Dialog.Title className="pr-6 break-words">
              Watch “{starter.choice.handle.name}” for {starter.choice.game.toUpperCase()}
            </Dialog.Title>
            <StartWatchForm
              key={starter.choice.game}
              starter={starter}
              choice={starter.choice}
              surface="page"
              openName={null}
              onChooseAgain={choose}
              onDone={() => {}}
            />
          </Dialog.Content>
        )}
      </Dialog>
    </div>
  );
}

/** What a watch could not keep, with the way to keep it. */
export function MissedSaves({ game }: { game: CampaignGame }) {
  const { folders, index, live } = useKept();
  const missed = (folders[game]?.missed ?? []).filter((x) => x.reason === "disk");
  const { rejected } = live[game];
  const named = missed.map((x) => {
    const write = index.writes.get(x.hash);
    return (
      [write?.date && formatPageDate(write.date), write?.countryName].filter(Boolean).join(", ") ||
      x.path
    );
  });
  return (
    <>
      {rejected && (
        <p className="border-2 border-amber-200 bg-amber-100 px-4 py-2.5 text-sm break-words text-gray-900">
          <strong>{rejectedText(rejected)[0]}</strong> {rejectedText(rejected)[1]}
        </p>
      )}
      {named.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-2 border-rose-200 bg-rose-100 px-4 py-2.5 text-sm text-gray-900">
          <p className="grow basis-64 break-words">
            <strong>
              {named.length === 1
                ? `${named[0]}, was not kept: the disk is full.`
                : `${savesText(named.length)} were not kept: the disk is full.`}
            </strong>{" "}
            {named.length === 1 ? "It is" : "They are"} kept when there is room, if the{" "}
            {named.length === 1 ? "file is" : "files are"} still there.
          </p>
          <Button className="py-1.5 dark:bg-white! dark:text-black!" onClick={retryMissed}>
            Try again
          </Button>
        </div>
      )}
    </>
  );
}
