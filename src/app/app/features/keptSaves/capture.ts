import type { CampaignGame } from "@/features/campaign/types";
import type { SaveIntegrity } from "@/wasm/wasm_compress";
import { sha256 } from "@/lib/sha256";
import { isDomException } from "./bytes";
import { sameStat } from "./folder";
import type { Listing } from "./folder";
import { fileStat, listSaves } from "./saveFiles";
import type { SaveFiles } from "./saveFiles";
import { commitCapture, syncFolder } from "./store";
import type { KeptEnv } from "./store";
import type { FileStat } from "./types";

/** A file that did not change for this time is read. */
const STABLE_MS = 1000;

export type WatchedRoot = {
  game: CampaignGame;
  watchId: string;
  session: string;
  handle: FileSystemDirectoryHandle | FileSystemFileHandle;
};

export type RejectedFile = {
  name: string;
  writtenAt: number;
  integrity: Exclude<SaveIntegrity, "complete">;
};

export type CaptureEvents = {
  captured: (save: {
    hash: string;
    kept: boolean;
    /** The bytes of a write that has no copy. */
    file: File | null;
  }) => void;
  /** The file that the game is writing, and the last file that is not a whole save. */
  files: (state: { writing: string | null; rejected: RejectedFile | null }) => void;
  /** The folder was read with no file left to wait for. */
  scanned: () => void;
  /** A path does not hold its content any more, or holds it again. */
  changed: () => void;
  failed: (name: string) => void;
};

/** Read the saves that a game writes, one at a time, and commit the whole ones. */
export function createCapture(
  root: WatchedRoot,
  env: KeptEnv,
  check: (data: Uint8Array) => Promise<SaveIntegrity>,
  events: CaptureEvents,
) {
  const { game, watchId, session } = root;
  const firstSeen = new Map<string, FileStat & { at: number }>();
  /** Files that are not whole saves, until they change. */
  const rejected = new Map<string, FileStat>();
  let lastRejected: RejectedFile | null = null;
  /** Saves without room get another try when the watch starts. */
  let retryMissed = true;
  let requested = false;
  let running: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  /** A file is stable when two listings, some time apart, agree on it. */
  function isStable(path: string, stat: FileStat): boolean {
    const seen = firstSeen.get(path);
    if (seen === undefined || !sameStat(seen, stat)) {
      firstSeen.set(path, { ...stat, at: env.now() });
      return false;
    }
    return env.now() - seen.at >= STABLE_MS;
  }

  /** Return false when the file must be read again. */
  async function captureFile(path: string, { listing, handles }: SaveFiles): Promise<boolean> {
    const stat = listing.get(path)!;
    const handle = handles.get(path)!;
    let data: Uint8Array<ArrayBuffer>;
    try {
      const file = await handle.getFile();
      data = new Uint8Array(await file.arrayBuffer());
      if (!sameStat(fileStat(file), stat)) return false;
      if (!sameStat(fileStat(await handle.getFile()), stat)) return false;
    } catch (error) {
      // The game wrote or moved the file during the read.
      if (isDomException(error, "NotReadableError")) return false;
      if (isDomException(error, "NotFoundError")) return true;
      throw error;
    }

    const integrity = await check(data);
    if (integrity !== "complete") {
      rejected.set(path, stat);
      lastRejected = { name: handle.name, writtenAt: stat.mtime, integrity };
      return true;
    }
    if (lastRejected?.name === handle.name) lastRejected = null;

    const hash = await sha256(data);
    // Known bytes can come from another path, so look at the paths again.
    const known = await env.db.get("writes", hash);
    const current: Listing =
      known === undefined ? listing : (await listSaves(root.handle, game)).listing;
    const result = await commitCapture(env, {
      ...stat,
      game,
      watchId,
      session,
      path,
      hash,
      data,
      name: handle.name,
      listing: current,
    });
    if (result === null) return true;
    const { kept, isWrite } = result;
    const isShown = isWrite && !kept;
    const file = isShown ? new File([data], handle.name, { lastModified: stat.mtime }) : null;
    events.captured({ hash, kept, file });
    return true;
  }

  async function scan(): Promise<void> {
    const files = await listSaves(root.handle, game);
    const found = await syncFolder(env, root, files.listing);
    if (found === null) return;
    if (found.isNoted) events.changed();
    const reads = [...found.changed, ...(retryMissed ? found.missed : [])];
    retryMissed = false;
    let writing: string | null = null;
    const waitFor = (name: string) => {
      if (writing === null) events.files({ writing: name, rejected: lastRejected });
      writing = name;
    };
    for (const path of reads) {
      if (stopped) return;
      const stat = files.listing.get(path)!;
      const bad = rejected.get(path);
      if (bad !== undefined && sameStat(bad, stat)) continue;
      if (isStable(path, stat) && (await captureFile(path, files))) continue;
      waitFor(files.handles.get(path)!.name);
      if (found.missed.includes(path)) retryMissed = true;
    }
    events.files({ writing, rejected: lastRejected });
    if (writing === null) events.scanned();
    else request(STABLE_MS);
  }

  function request(delay = 0): void {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      requested = true;
      running ??= drain().finally(() => (running = null));
    }, delay);
  }

  async function drain(): Promise<void> {
    while (requested && !stopped) {
      requested = false;
      try {
        await scan();
      } catch (error) {
        events.failed(error instanceof Error ? error.name : String(error));
      }
    }
  }

  return {
    request,
    /** Read the saves again that had no room. */
    retry(): void {
      retryMissed = true;
      request();
    },
    /** Finish the copy that runs, then read no more. */
    async stop(): Promise<void> {
      stopped = true;
      clearTimeout(timer);
      await running;
    },
  };
}
