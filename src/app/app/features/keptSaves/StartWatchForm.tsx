import { useEffect, useState } from "react";
import { cx } from "class-variance-authority";
import { Button } from "@/components/Button";
import { GameButton } from "@/components/game";
import { readKeptIdentity } from "@/features/campaign/reader";
import { roomFor, useKept } from "./keptStore";
import { act } from "./watchService";
import { commitButton } from "./styles";
import { formatBytes, formatPageDate, roomText, savesText } from "./text";
import { otherGame } from "./useWatchStart";
import type { WatchChoice, WatchStarter } from "./useWatchStart";

function newestFile({ saves }: WatchChoice) {
  const [path] = [...saves.listing].reduce((a, b) => (b[1].mtime > (a[1]?.mtime ?? -1) ? b : a), [
    "",
    null,
  ] as [string, { mtime: number; size: number } | null]);
  return { handle: saves.handles.get(path), size: saves.listing.get(path)?.size };
}

/** Name the newest save, so the player knows that the folder is the right one. */
function useNewestName(choice: WatchChoice, enabled: boolean): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    const { handle } = newestFile(choice);
    if (!enabled || handle === undefined) return;
    let current = true;
    void (async () => {
      const { identity } = await readKeptIdentity(choice.game, await handle.getFile());
      if (!current || !identity.date) return;
      setName([identity.countryName, formatPageDate(identity.date)].filter(Boolean).join(", "));
    })().catch(() => {});
    return () => {
      current = false;
    };
  }, [choice, enabled]);
  return name;
}

/** What was found, and the consent to keep copies. */
export function StartWatchForm({
  starter,
  choice,
  surface,
  openName,
  onChooseAgain,
  onDone,
}: {
  starter: WatchStarter;
  choice: WatchChoice;
  surface: "page" | "game";
  /** The open save, when it is in the folder. */
  openName: string | null;
  onChooseAgain: () => void;
  onDone: () => void;
}) {
  const [keep, setKeep] = useState(false);
  const [alsoKeep, setAlsoKeep] = useState(false);
  const isPage = surface === "page";
  const kept = useKept();
  const newest = useNewestName(choice, isPage);
  const { game, handle, saves, size, otherCount } = choice;
  const count = saves.listing.size;
  const label = game.toUpperCase();
  const otherLabel = otherGame(game).toUpperCase();
  const room = roomFor(kept, newestFile(choice).size);
  const quiet = isPage ? "text-gray-600 dark:text-gray-300" : "text-game-ink-500";
  const primary = isPage ? (
    <Button type="submit" variant="primary" className={commitButton}>
      Start watching
    </Button>
  ) : (
    <GameButton type="submit" variant="commit">
      Start watching
    </GameButton>
  );
  const CancelButton = isPage ? Button : GameButton;

  if (count === 0 && otherCount > 0) {
    return (
      <div className="flex flex-col gap-3">
        <p>
          No {label} saves in “{handle.name}”, but {savesText(otherCount, otherLabel)}.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <CancelButton onClick={() => void starter.switchGame()}>
            Watch for {otherLabel}
          </CancelButton>
          <CancelButton onClick={onChooseAgain}>Choose again</CancelButton>
        </div>
      </div>
    );
  }

  const found = handle.kind === "file" ? "this file" : "this folder";
  const already =
    count === 1
      ? `Also keep the save already in ${found}`
      : `Also keep the ${savesText(count)} already in ${found}`;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        act(starter.start({ keep, alsoKeep }));
        onDone();
      }}
    >
      <p className="break-words">
        {count === 0
          ? `No ${label} saves in “${handle.name}” yet. The next one is seen.`
          : handle.kind === "file"
            ? `${handle.name}, ${formatBytes(size)}.`
            : `${savesText(count, label)} in this folder, ${formatBytes(size)}.`}
        {newest && ` Latest: ${newest}.`}
      </p>
      <Option
        surface={surface}
        label="Keep a copy of each new save"
        checked={keep}
        onChange={setKeep}
      >
        Open it after the game writes over it. Every different save is kept, from every campaign.
        {room !== null && ` Room for ${roomText(room)} of this size.`}
      </Option>
      {count > 0 && (
        <Option
          surface={surface}
          label={openName ? `${already}, with the open save ${openName}` : already}
          checked={keep && alsoKeep}
          disabled={!keep}
          onChange={setAlsoKeep}
        >
          {formatBytes(size)}.{!keep && " Available with copies on."}
        </Option>
      )}
      <p className={quiet}>
        Copies stay in this browser and are not uploaded. The browser may delete them if the disk is
        nearly full. Saves written and overwritten while no PDX Tools tab is open cannot be
        recovered. The browser can delay a background tab.
      </p>
      <div
        className={cx(
          "flex justify-end gap-2",
          !isPage && "-mx-3 border-t border-game-line px-3 pt-3",
        )}
      >
        <CancelButton onClick={starter.cancel}>Cancel</CancelButton>
        {primary}
      </div>
    </form>
  );
}

export function Option({
  surface,
  label,
  checked,
  disabled = false,
  onChange,
  children,
}: {
  surface: "page" | "game";
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  children?: React.ReactNode;
}) {
  const isPage = surface === "page";
  return (
    <label className={cx("flex items-start gap-2.5", disabled && "opacity-60")}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className={cx(
          "mt-0.5 size-4 shrink-0",
          isPage ? "accent-sky-700" : "accent-game-accent-300 [color-scheme:dark]",
        )}
      />
      <span className="min-w-0">
        <span className={cx("block font-medium break-words", !isPage && "text-game-ink-100")}>
          {label}
        </span>
        <span className={isPage ? "text-gray-600 dark:text-gray-300" : "text-game-ink-500"}>
          {children}
        </span>
      </span>
    </label>
  );
}
