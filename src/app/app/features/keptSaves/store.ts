import type { CampaignGame } from "@/features/campaign/types";
import type { KeptBytes } from "./bytes";
import { isDomException } from "./bytes";
import type { KeptDb, KeptTransaction } from "./db";
import { compareFolder, newestFiles, recordContent, sameStat, seedManifest } from "./folder";
import type { Listing } from "./folder";
import { DEFAULT_SETTINGS, UNKNOWN_IDENTITY } from "./types";
import type { FileStat, FolderState, KeptIdentity, KeptSave, WatchConfig } from "./types";

export type KeptEnv = {
  db: KeptDb;
  bytes: KeptBytes;
  /** Run alone among every tab and worker of the site. */
  exclusive: <T>(run: () => Promise<T>) => Promise<T>;
  now: () => number;
};

export type Capture = FileStat & {
  game: CampaignGame;
  watchId: string;
  session: string;
  path: string;
  name: string;
  hash: string;
  data: Uint8Array<ArrayBuffer>;
  listing: Listing;
};

export type CommitResult = { kept: boolean; isWrite: boolean };

export async function readSettings(db: Pick<KeptDb, "get">) {
  return (await db.get("settings", "settings")) ?? DEFAULT_SETTINGS;
}

/** The folder of a watch, unless the player stopped it or chose another one. */
async function readFolder(
  { get }: Pick<KeptTransaction, "get">,
  game: CampaignGame,
  watchId: string,
): Promise<{ watch: WatchConfig; folder: FolderState } | null> {
  const [watch, folder] = await Promise.all([get("watches", game), get("folders", game)]);
  if (watch?.id !== watchId || !watch.wasWatching || folder?.watchId !== watchId) return null;
  return { watch, folder };
}

/** Start a watch and its folder together. Files that are not wanted are excluded until a write. */
export function startWatch(
  env: KeptEnv,
  watch: WatchConfig,
  { listing, seed }: { listing: Listing; seed: boolean },
): Promise<void> {
  const { game, id } = watch;
  return changeStore(env, async ({ put }) => {
    put("watches", watch);
    put("folders", {
      game,
      watchId: id,
      newest: newestFiles(listing),
      manifest: seed ? seedManifest(listing) : [],
      missed: [],
    });
  });
}

/** Change the records alone, so that no commit works with the old ones. */
export function changeStore<T>(
  env: KeptEnv,
  run: (transaction: KeptTransaction) => Promise<T>,
): Promise<T> {
  return env.exclusive(() => env.db.transact(run));
}

/**
 * Note what a listing shows. Give the paths to read and the saves that had no
 * room, or null when this watch ended.
 */
export function syncFolder(
  env: KeptEnv,
  { game, watchId }: { game: CampaignGame; watchId: string },
  listing: Listing,
): Promise<{ changed: string[]; missed: string[]; isNoted: boolean } | null> {
  return changeStore(env, async (transaction) => {
    const current = await readFolder(transaction, game, watchId);
    if (current === null) return null;
    const { folder } = current;
    const { manifest, changed } = compareFolder(folder.manifest, listing, env.now());
    const missed = folder.missed.filter((x) => {
      const stat = listing.get(x.path);
      return stat !== undefined && sameStat(stat, x);
    });
    transaction.put("folders", { ...folder, manifest, missed });
    // A path that lost its content shows in the rows and in the delete dialog.
    const states = new Map(folder.manifest.map((x) => [x.path, x.state]));
    const isNoted = manifest.some((x) => states.get(x.path) !== x.state);
    return { changed, missed: missed.map((x) => x.path), isNoted };
  });
}

type KeepResult =
  /** The copy is in storage. A new file has its modification time. */
  { kind: "stored"; modified: number | null } | { kind: "missed"; reason: "limit" | "disk" };

async function keepBytes(env: KeptEnv, { hash, data }: Capture): Promise<KeepResult> {
  const { db, bytes } = env;
  const [saves, settings, present] = await Promise.all([
    db.all("saves"),
    readSettings(db),
    bytes.list(),
  ]);
  const saved = saves.find((save) => save.hash === hash);
  if (saved !== undefined && (await bytes.size(hash)) === saved.size) {
    return { kind: "stored", modified: null };
  }

  // A copy that the browser lost takes no room.
  const names = new Set(present);
  const used = saves.reduce(
    (total, save) => total + (save.hash !== hash && names.has(save.hash) ? save.size : 0),
    0,
  );
  if (used + data.byteLength > settings.limit) return { kind: "missed", reason: "limit" };
  try {
    return { kind: "stored", ...(await bytes.write(hash, data)) };
  } catch (error) {
    if (isDomException(error, "QuotaExceededError")) return { kind: "missed", reason: "disk" };
    throw error;
  }
}

/**
 * Keep one complete save. Consent, duplicates and the limit are read at this
 * moment. The bytes come first, then every record in one transaction. Null
 * when the watch ended, or watches another folder now.
 */
export function commitCapture(env: KeptEnv, capture: Capture): Promise<CommitResult | null> {
  return env.exclusive(async () => {
    const { db, now } = env;
    const { game, watchId, path, name, hash, size, mtime, listing } = capture;
    const before = await readFolder(db, game, watchId);
    if (before === null) return null;
    const { keep } = before.watch;
    const result = keep ? await keepBytes(env, capture) : null;

    return db.transact(async (transaction) => {
      const { get, put } = transaction;
      const { folder } = (await readFolder(transaction, game, watchId))!;
      const [logged, saved, settings] = await Promise.all([
        get("writes", hash),
        get("saves", hash),
        readSettings(transaction),
      ]);
      const { manifest, isWrite } = recordContent(
        folder.manifest,
        { path, hash, size, mtime },
        { known: logged !== undefined, listing, now: now() },
      );
      const missed = folder.missed.filter((x) => x.path !== path);
      if (result?.kind === "missed")
        missed.push({ path, hash, size, mtime, reason: result.reason });
      put("folders", { ...folder, manifest, missed });

      // A retry finds its write in the log and does not move it.
      let writtenAt = logged?.writtenAt ?? mtime;
      if (isWrite || logged === undefined) {
        // Bytes that return can have their old modification time.
        if (logged !== undefined) writtenAt = Math.max(mtime, now());
        const seq = settings.seq + 1;
        put("settings", { ...settings, seq });
        put("writes", {
          ...UNKNOWN_IDENTITY,
          ...(saved && identityOf(saved)),
          ...logged,
          hash,
          game,
          seq,
          writtenAt,
          name,
          session: capture.session,
        });
      }

      if (result?.kind === "stored") {
        const names = saved?.names ?? [];
        put("saves", {
          ...UNKNOWN_IDENTITY,
          ...(logged && identityOf(logged)),
          hash,
          game,
          identity: "pending",
          name,
          size,
          keptAt: now(),
          uploadedId: null,
          ...saved,
          names: names.includes(name) ? names : [...names, name],
          writtenAt,
          watchId,
          opfsModified: result.modified ?? saved!.opfsModified,
        });
      }
      return { kept: result?.kind === "stored", isWrite };
    });
  });
}

function identityOf(save: KeptIdentity): KeptIdentity {
  const { playthroughId, campaignIdHint, date, flag, countryName } = save;
  return { playthroughId, campaignIdHint, date, flag, countryName };
}

export function recordIdentity(
  env: KeptEnv,
  hash: string,
  identity: Partial<KeptIdentity>,
  status?: KeptSave["identity"],
): Promise<void> {
  return changeStore(env, async ({ get, put }) => {
    const [save, write] = await Promise.all([get("saves", hash), get("writes", hash)]);
    if (save) put("saves", { ...save, ...identity, identity: status ?? save.identity });
    if (write) put("writes", { ...write, ...identity });
  });
}

/** Delete the record before the bytes, so a record never outlives its bytes. */
export function deleteKept(env: KeptEnv, hash: string): Promise<void> {
  return env.exclusive(async () => {
    await env.db.transact(async ({ remove }) => remove("saves", hash));
    await env.bytes.remove(hash);
  });
}

/** Writes without a copy are only for the recent past. */
const UNKEPT_WRITES = 200;

/** Remove the bytes that a stopped commit or delete left without a record, and old writes. */
export function sweepOrphans(env: KeptEnv): Promise<void> {
  return env.exclusive(async () => {
    const saved = await env.db.transact(async ({ all, remove }) => {
      const hashes = new Set((await all("saves")).map((save) => save.hash));
      const writes = (await all("writes")).filter((x) => !hashes.has(x.hash));
      const old = writes.toSorted((a, b) => b.seq - a.seq).slice(UNKEPT_WRITES);
      for (const { hash } of old) remove("writes", hash);
      return hashes;
    });
    const names = await env.bytes.list();
    for (const name of names.filter((x) => !saved.has(x))) await env.bytes.remove(name);
  });
}
