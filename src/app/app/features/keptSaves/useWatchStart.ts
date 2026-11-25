import { useState } from "react";
import { isAbortError } from "@/lib/abortController";
import { getErrorMessage } from "@/lib/getErrorMessage";
import type { CampaignGame } from "@/features/campaign/types";
import { listSaves } from "./saveFiles";
import type { SaveFiles } from "./saveFiles";
import { beginWatch } from "./watchService";
import type { WatchConfig } from "./types";

/** A folder or file that the player chose, and the saves in it. */
export type WatchChoice = {
  game: CampaignGame;
  handle: WatchConfig["handle"];
  saves: SaveFiles;
  size: number;
  /** The saves of the other game, which can be the folder that was meant. */
  otherCount: number;
};

export const otherGame = (game: CampaignGame): CampaignGame => (game === "eu4" ? "eu5" : "eu4");

async function inspect(game: CampaignGame, handle: WatchConfig["handle"]): Promise<WatchChoice> {
  const [saves, other] = await Promise.all([
    listSaves(handle, game),
    handle.kind === "directory" ? listSaves(handle, otherGame(game)) : null,
  ]);
  const size = [...saves.listing.values()].reduce((total, stat) => total + stat.size, 0);
  return { game, handle, saves, size, otherCount: other?.listing.size ?? 0 };
}

/** Choose what to watch, then confirm it. Nothing is read into the app before that. */
export function useWatchStart() {
  const [choice, setChoice] = useState<WatchChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (choose: () => Promise<WatchChoice>) => {
    setError(null);
    try {
      setChoice(await choose());
    } catch (failure) {
      if (!isAbortError(failure)) setError(getErrorMessage(failure));
    }
  };
  return {
    choice,
    error,
    cancel: () => setChoice(null),
    chooseFolder: (game: CampaignGame, startIn?: FileSystemHandle) =>
      run(async () => {
        // The picker needs the click, so nothing is awaited before it.
        const id = `${game}-saves`;
        const handle = await window.showDirectoryPicker({ id, mode: "read", startIn });
        return inspect(game, handle);
      }),
    chooseFile: (game: CampaignGame, handle: FileSystemFileHandle) =>
      run(() => inspect(game, handle)),
    switchGame: () => run(() => inspect(otherGame(choice!.game), choice!.handle)),
    start: async (options: { keep: boolean; alsoKeep: boolean }) => {
      if (choice === null) return;
      const { game, handle, saves } = choice;
      setChoice(null);
      await beginWatch({ game, handle, saves, ...options });
    },
  };
}

export type WatchStarter = ReturnType<typeof useWatchStart>;
