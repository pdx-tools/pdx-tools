import { proxy, wrap } from "comlink";
import type { Remote } from "comlink";
import { trackWorker } from "@/lib/sentryWorker";
import { captureException } from "@/lib/captureException";
import { emitEvent } from "@/lib/events";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { toast } from "@/lib/toast";
import { openLocalInput, subscribeSaveInput } from "@/features/engine/engineStore";
import { localSaveRegistry } from "@/features/campaign/localSaves";
import { readKeptIdentity } from "@/features/campaign/reader";
import type { CampaignGame, LocalSaveRef } from "@/features/campaign/types";
import { keptBytes, keptFile, keptHandle } from "./bytes";
import type { CaptureEvents } from "./capture";
import type { CaptureWorker } from "./capture.worker";
import { keptDb } from "./db";
import { keptEnv } from "./env";
import { identifyFiles, newestFiles, sameStat } from "./folder";
import { fileStat } from "./saveFiles";
import type { SaveFiles } from "./saveFiles";
import { findKept, IDLE_WATCH, indexKept, setLive, useKept } from "./keptStore";
import type { GameWatch } from "./keptStore";
import { changeStore, deleteKept, readSettings, recordIdentity, startWatch } from "./store";
import { supportsKeptSaves } from "./support";
import { GAMES } from "./types";
import type { KeptIdentity, UpdateMap, WatchConfig } from "./types";

/** The bytes of the last write of a game that has no copy. */
type Snapshot = {
  game: CampaignGame;
  hash: string;
  seq: number;
  file: File;
  identity: Partial<KeptIdentity>;
};

type Message =
  | { kind: "changed" | "retry" | "hello" }
  | { kind: "take"; game: CampaignGame; tab: string }
  /** How the tab that watches a game does. */
  | { kind: "health"; game: CampaignGame; phase: GameWatch["phase"] }
  | { kind: "snapshot"; snapshot: Snapshot };

let channel: BroadcastChannel | null = null;
let tabId = "";
const send = (message: Message) => channel?.postMessage(message);

/** The watch that this tab runs or waits for. */
type Run = { watchId: string; end: () => Promise<void> };
const runs: Partial<Record<CampaignGame, Run>> = {};
const workers: Partial<Record<CampaignGame, Remote<CaptureWorker>>> = {};

async function readKept(): Promise<void> {
  const [saves, writes, watches, folders, settings, estimate, persisted, names] = await Promise.all(
    [
      keptDb.all("saves"),
      keptDb.all("writes"),
      keptDb.all("watches"),
      keptDb.all("folders"),
      readSettings(keptDb),
      navigator.storage.estimate(),
      navigator.storage.persisted(),
      keptBytes.list(),
    ],
  );
  await localSaveRegistry.syncKept(saves, keptHandle);
  const present = new Set(names);
  const byGame = <T extends { game: CampaignGame }>(records: T[]) =>
    Object.fromEntries(records.map((record) => [record.game, record]));
  useKept.setState({
    saves,
    writes,
    index: indexKept(saves, writes, folders),
    missing: new Set(saves.flatMap(({ hash }) => (present.has(hash) ? [] : [hash]))),
    watches: byGame(watches),
    folders: byGame(folders),
    settings,
    storage: { available: (estimate.quota ?? 0) - (estimate.usage ?? 0), persisted },
  });
  await matchFiles();
}

/** One call reads at a time. A call during a read gets the result of a later read. */
export function coalesce(read: () => Promise<void>): () => Promise<void> {
  let stale = false;
  let running: Promise<void> | null = null;
  const drain = async () => {
    try {
      while (stale) {
        stale = false;
        await read();
      }
    } finally {
      running = null;
    }
  };
  return () => {
    stale = true;
    return (running ??= drain());
  };
}

/** Read the database again after a change in this tab or another one. */
const refreshKept = coalesce(readKept);

/** Find the picked files that the watch read, so each save has one row. */
async function matchFiles(): Promise<void> {
  const { watches, folders } = useKept.getState();
  for (const entry of localSaveRegistry.entries()) {
    const { game, ref, version, hash } = entry;
    const [watch, folder] = [watches[game], folders[game]];
    if (entry.kept || hash !== null || ref.kind !== "handle") continue;
    if (version === null || watch === undefined || folder?.watchId !== watch.id) continue;
    const path =
      watch.handle.kind === "directory"
        ? (await watch.handle.resolve(ref.file))?.join("/")
        : (await watch.handle.isSameEntry(ref.file))
          ? watch.handle.name
          : undefined;
    const file = folder.manifest.find((x) => x.path === path);
    if (!file?.hash || file.size !== version.size || file.mtime !== version.lastModified) continue;
    localSaveRegistry.recordHash(entry.id, version, file.hash);
  }
}

async function changed(): Promise<void> {
  send({ kind: "changed" });
  await refreshKept();
}

/** Parse the saves whose campaign is not known. Opening a save also identifies it. */
async function identify(): Promise<void> {
  await navigator.locks.request("kept-identity", async () => {
    for (;;) {
      const save = (await keptDb.all("saves")).find((x) => x.identity === "pending");
      if (save === undefined) return changed();
      const file = await keptFile(save.hash);
      const result = file && (await readKeptIdentity(save.game, file));
      await recordIdentity(keptEnv, save.hash, result?.identity ?? {}, result?.status ?? "failed");
      void changed().catch(captureException);
    }
  });
}

export async function identifyAgain(hash: string): Promise<void> {
  await recordIdentity(keptEnv, hash, {}, "pending");
  await identify();
}

const snapshots: Partial<Record<CampaignGame, Snapshot>> = {};
/** The list entries of the snapshots. An open one stays until another save opens. */
const snapshotEntries: Record<CampaignGame, string[]> = { eu4: [], eu5: [] };

/** Offer the bytes of a write that has no copy until the next write. */
export async function holdSnapshot(snapshot: Snapshot): Promise<void> {
  const { game, hash, seq, file, identity } = snapshot;
  // An earlier write can arrive late, from the tab that watched before.
  if (seq < (snapshots[game]?.seq ?? 0)) return;
  snapshots[game] = snapshot;
  const { playthroughId = null, campaignIdHint = null, date } = identity;
  if (!date) return;
  const [entry] = await localSaveRegistry.register(game, [{ kind: "file", file }]);
  localSaveRegistry.recordIdentity(entry.id, { playthroughId, campaignIdHint, date }, file, hash);
  snapshotEntries[game].push(entry.id);
  dropSnapshots(game);
}

/** Remove the entries of earlier snapshots. */
function dropSnapshots(game: CampaignGame): void {
  const open = openLocalInput(game);
  const openId = open && localSaveRegistry.entryOf(game, open)?.id;
  const newest = snapshotEntries[game].at(-1);
  snapshotEntries[game] = snapshotEntries[game].filter((id) => {
    const isKept = id === newest || id === openId;
    if (!isKept) localSaveRegistry.remove(id);
    return isKept;
  });
}

async function takeSnapshot(game: CampaignGame, hash: string, file: File): Promise<void> {
  const { identity } = await readKeptIdentity(game, file);
  await recordIdentity(keptEnv, hash, identity);
  const { seq = 0 } = (await keptDb.get("writes", hash)) ?? {};
  const snapshot: Snapshot = { game, hash, seq, file, identity };
  send({ kind: "snapshot", snapshot });
  await holdSnapshot(snapshot);
  await changed();
}

function setHealth(game: CampaignGame, phase: GameWatch["phase"]): void {
  if (useKept.getState().live[game].phase === phase) return;
  setLive(game, { phase });
  send({ kind: "health", game, phase });
}

function captureEvents(game: CampaignGame, previous: WatchConfig): CaptureEvents {
  let catchUp: { at: number; kept: number } | null = { at: Date.now(), kept: 0 };
  // Publish the saves in the order of their writes.
  let publishing: Promise<void> = Promise.resolve();
  const publish = (run: () => Promise<void>) => {
    publishing = publishing.then(run).catch((error) => void captureException(error));
  };
  return {
    captured: ({ hash, kept, file }) => {
      if (catchUp !== null && kept) catchUp.kept += 1;
      if (catchUp === null) setLive(game, { resumed: null });
      act(changed());
      if (file !== null) publish(() => takeSnapshot(game, hash, file));
      else if (kept) publish(identify);
    },
    files: (files) => setLive(game, files),
    scanned: () => {
      setHealth(game, "watching");
      void touch(game);
      if (catchUp === null) return;
      const { at, kept } = catchUp;
      catchUp = null;
      if (previous.keep && previous.lastWatchedAt !== null) {
        setLive(game, { resumed: { kept, from: previous.lastWatchedAt, to: at } });
      }
      // The result of a scan also has the saves that had no room.
      publish(async () => {
        await changed();
        setLive(game, { isCaughtUp: true });
      });
    },
    changed: () => act(changed()),
    failed: (name) => {
      if (name === "NotAllowedError") setHealth(game, "no-access");
      else if (name === "NotFoundError") setHealth(game, "not-found");
      else captureException(new Error(`Watching failed: ${name}`));
    },
  };
}

function changeWatch(
  game: CampaignGame,
  change: Partial<Omit<WatchConfig, "game" | "id" | "handle">>,
): Promise<void> {
  return changeStore(keptEnv, async ({ get, put }) => {
    const watch = await get("watches", game);
    if (watch) put("watches", { ...watch, ...change });
  });
}

/** Note that the folder was read, for the report of what could be missed later. */
async function touch(game: CampaignGame): Promise<void> {
  if (useKept.getState().live[game].phase !== "watching") return;
  await changeWatch(game, { lastWatchedAt: Date.now() }).catch(captureException);
}

/** Read the folder in a worker until `released`. */
async function capture(config: WatchConfig, released: Promise<void>): Promise<void> {
  const { game, id, handle } = config;
  const raw = new Worker(new URL("./capture.worker.ts", import.meta.url), { type: "module" });
  const untrack = trackWorker(raw);
  const api = wrap<CaptureWorker>(raw);
  workers[game] = api;
  setLive(game, { ...IDLE_WATCH, since: Date.now() });
  setHealth(game, "watching");
  try {
    const root = { game, watchId: id, session: crypto.randomUUID(), handle };
    await api.start(root, proxy(captureEvents(game, config)));
    await released;
    await api.stop();
    await touch(game);
  } finally {
    delete workers[game];
    untrack();
    raw.terminate();
  }
}

/** Watch when no other tab does, or wait for that tab. */
async function run(game: CampaignGame): Promise<void> {
  const config = await keptDb.get("watches", game);
  if (!config?.wasWatching || runs[game] !== undefined) return;
  if ((await config.handle.queryPermission({ mode: "read" })) !== "granted") {
    // The watch can stop while the browser answers.
    const isWanted = (await keptDb.get("watches", game))?.wasWatching;
    if (isWanted && runs[game] === undefined) setLive(game, { ...IDLE_WATCH, phase: "paused" });
    return;
  }
  if (runs[game] !== undefined) return;

  const released = Promise.withResolvers<void>();
  const waiting = new AbortController();
  const ended = Promise.withResolvers<void>();
  const current: Run = {
    watchId: config.id,
    end: () => {
      released.resolve();
      waiting.abort();
      return ended.promise;
    },
  };
  runs[game] = current;
  const name = `kept-watch-${game}`;
  const work = async (lock: Lock | null) => {
    if (lock === null) return false;
    // The watch can change while this tab waits for another one.
    const latest = await keptDb.get("watches", game);
    if (latest?.wasWatching && latest.id === config.id) await capture(latest, released.promise);
    return true;
  };
  try {
    if (await navigator.locks.request(name, { ifAvailable: true }, work)) return;
    setLive(game, { ...IDLE_WATCH, phase: "elsewhere", isCaughtUp: true });
    send({ kind: "hello" });
    await navigator.locks.request(name, { signal: waiting.signal }, work);
  } catch (error) {
    if (!waiting.signal.aborted) captureException(error);
  } finally {
    if (runs[game] === current) delete runs[game];
    setLive(game, IDLE_WATCH);
    ended.resolve();
  }
}

const start = (game: CampaignGame) => void run(game).catch(captureException);

async function endRun(game: CampaignGame): Promise<void> {
  await runs[game]?.end();
  setLive(game, IDLE_WATCH);
}

/** Follow the changes that another tab made to the watches. */
async function reconcile(): Promise<void> {
  await refreshKept();
  for (const game of GAMES) {
    const config = useKept.getState().watches[game];
    const current = runs[game];
    if (current !== undefined && !(config?.wasWatching && config.id === current.watchId)) {
      await endRun(game);
    }
    if (runs[game] !== undefined) continue;
    if (config?.wasWatching) start(game);
    // A tab that waits for the permission has no run to end.
    else setLive(game, IDLE_WATCH);
  }
}

function onMessage(message: Message): void {
  switch (message.kind) {
    case "changed":
      void reconcile().catch(captureException);
      break;
    case "retry":
      for (const game of GAMES) void workers[game]?.retry();
      break;
    case "hello":
      for (const game of GAMES) {
        if (workers[game] === undefined) continue;
        send({ kind: "health", game, phase: useKept.getState().live[game].phase });
        const snapshot = snapshots[game];
        if (snapshot !== undefined) send({ kind: "snapshot", snapshot });
      }
      break;
    case "health": {
      const { game, phase } = message;
      if (workers[game] !== undefined || runs[game] === undefined) break;
      setLive(game, { phase: phase === "watching" ? "elsewhere" : phase });
      break;
    }
    case "snapshot":
      void holdSnapshot(message.snapshot).catch(captureException);
      break;
    case "take": {
      const { game, tab } = message;
      if (tab === tabId || runs[game] === undefined) break;
      // Let the other tab get the lock first, then wait for it.
      void endRun(game).then(() => {
        setLive(game, { phase: "elsewhere" });
        setTimeout(start, 500, game);
      });
    }
  }
}

let started = false;

export function startKeptSaves(): void {
  if (started || !supportsKeptSaves()) return;
  started = true;
  tabId = crypto.randomUUID();
  channel = new BroadcastChannel("kept-saves");
  channel.addEventListener("message", ({ data }: MessageEvent<Message>) => onMessage(data));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible")
      for (const game of GAMES) void workers[game]?.scan();
  });
  subscribeSaveInput(holdOpenSave);
  // A file that was read after the folder can be one of the folder.
  localSaveRegistry.subscribe(
    coalesce(() => matchFiles().catch((error) => void captureException(error))),
  );
  void (async () => {
    await refreshKept();
    for (const game of GAMES) start(game);
    if (useKept.getState().saves?.some((save) => save.identity === "pending")) await identify();
  })().catch(captureException);
}

/** Run an action that a click started. A failure is shown, as nothing else shows it. */
export function act(action: Promise<unknown>): void {
  action.catch((error) => {
    captureException(error);
    toast.error("That did not work", { description: getErrorMessage(error) });
  });
}

export async function beginWatch({
  game,
  handle,
  saves,
  keep,
  alsoKeep,
}: {
  game: CampaignGame;
  handle: WatchConfig["handle"];
  saves: SaveFiles;
  keep: boolean;
  alsoKeep: boolean;
}): Promise<void> {
  // Do not delay the start on the answer of the browser.
  if (keep) void navigator.storage.persist();
  await endRun(game);
  const previous = await keptDb.get("watches", game);
  const updateMap = previous?.updateMap ?? (game === "eu4" ? "Monthly" : "Yearly");
  emitEvent({ kind: "Save watching", frequency: updateMap });
  const id = crypto.randomUUID();
  await startWatch(
    keptEnv,
    { game, id, handle, keep, updateMap, wasWatching: true, lastWatchedAt: null },
    { listing: saves.listing, seed: !(keep && alsoKeep) },
  );
  await changed();
  start(game);
  void identifyNewest(game, id, saves).catch(captureException);
}

/** Find the campaigns of the last files, to know which save is the last of its campaign. */
async function identifyNewest(game: CampaignGame, watchId: string, saves: SaveFiles) {
  const newest = await identifyFiles(newestFiles(saves.listing), async (x) => {
    const file = await saves.handles.get(x.path)!.getFile();
    if (!sameStat(fileStat(file), x)) return null;
    return (await readKeptIdentity(game, file)).identity.playthroughId ?? null;
  });
  await changeStore(keptEnv, async ({ get, put }) => {
    const folder = await get("folders", game);
    if (folder?.watchId === watchId) put("folders", { ...folder, newest });
  });
  await changed();
}

/** Permission needs the click, so nothing is awaited before the request. */
export async function resumeWatch(game: CampaignGame): Promise<void> {
  const config = useKept.getState().watches[game];
  if (config === undefined) return;
  if ((await config.handle.requestPermission({ mode: "read" })) !== "granted") return;
  await changeWatch(game, { wasWatching: true });
  await changed();
  if (runs[game] === undefined) start(game);
  else retryMissed();
}

export async function setKeep(game: CampaignGame, keep: boolean): Promise<void> {
  if (keep) void navigator.storage.persist();
  await changeWatch(game, { keep });
  await changed();
}

export async function setUpdateMap(game: CampaignGame, updateMap: UpdateMap): Promise<void> {
  await changeWatch(game, { updateMap });
  await changed();
}

export async function stopWatch(game: CampaignGame): Promise<void> {
  await endRun(game);
  await changeWatch(game, { wasWatching: false });
  await changed();
}

/** Forget the folder. Its copies stay. */
export async function forgetWatch(game: CampaignGame): Promise<void> {
  await endRun(game);
  await changeStore(keptEnv, async ({ remove }) => {
    remove("watches", game);
    remove("folders", game);
  });
  await changed();
}

export function takeWatch(game: CampaignGame): void {
  send({ kind: "take", game, tab: tabId });
}

/** Read the folders again, with the saves that had no room. */
export function retryMissed(): void {
  onMessage({ kind: "retry" });
  send({ kind: "retry" });
}

export async function changeLimit(limit: number): Promise<void> {
  await changeStore(keptEnv, async (transaction) => {
    transaction.put("settings", { ...(await readSettings(transaction)), limit });
  });
  await changed();
  retryMissed();
}

const openLock = (hash: string) => `kept-open-${hash}`;

/** Hold a kept save until the returned function is called. No tab can delete it. */
export function holdKept(hash: string): { granted: Promise<void>; release: () => void } {
  const held = Promise.withResolvers<void>();
  const granted = Promise.withResolvers<void>();
  navigator.locks
    .request(openLock(hash), { mode: "shared" }, () => {
      granted.resolve();
      return held.promise;
    })
    .catch(captureException);
  return { granted: granted.promise, release: held.resolve };
}

let releaseOpen: (() => void) | null = null;

/** Hold the kept save that the page shows, from its input until the next input. */
function holdOpenSave(game: CampaignGame | null, ref: LocalSaveRef | null): void {
  const hash = game && ref && localSaveRegistry.entryOf(game, ref)?.kept?.hash;
  const release = releaseOpen;
  releaseOpen = hash ? holdKept(hash).release : null;
  release?.();
  for (const x of GAMES) dropSnapshots(x);
}

/** The kept saves that any tab has open. */
export async function openKept(): Promise<Set<string>> {
  const { held = [] } = await navigator.locks.query();
  const prefix = openLock("");
  return new Set(
    held.flatMap(({ name }) => (name?.startsWith(prefix) ? [name.slice(prefix.length)] : [])),
  );
}

/** Delete the saves that no tab has open. */
export async function deleteKeptSaves(hashes: readonly string[]): Promise<void> {
  for (const hash of hashes) {
    await navigator.locks.request(openLock(hash), { ifAvailable: true }, async (lock) => {
      if (lock !== null) await deleteKept(keptEnv, hash);
    });
  }
  await changed();
  retryMissed();
}

/** Record the permalink of a kept save. */
export async function recordUpload(hash: string, uploadedId: string): Promise<void> {
  await changeStore(keptEnv, async ({ get, put }) => {
    const save = await get("saves", hash);
    if (save) put("saves", { ...save, uploadedId });
  });
  await changed();
}

/**
 * Get a function that pairs the save of a view with its upload, by the hash of
 * the bytes that were sent. Call it before the upload starts, as the save can move to its kept copy during it.
 */
export function pairUpload(game: CampaignGame, ref: LocalSaveRef) {
  const entry = localSaveRegistry.entryOf(game, ref);
  return (uploadedId: string, hash: string | null): void => {
    if (entry !== undefined) localSaveRegistry.recordUpload(entry, hash, uploadedId);
    if (hash !== null && findKept(hash)) act(recordUpload(hash, uploadedId));
  };
}

/** Store what the viewer knows about a kept save that it opened. */
export async function recordOpened(hash: string, identity: KeptIdentity): Promise<void> {
  const save = findKept(hash);
  if (save === undefined) return;
  const same =
    save.identity === "ok" &&
    save.playthroughId === identity.playthroughId &&
    save.flag === identity.flag &&
    save.countryName === identity.countryName;
  if (same) return;
  await recordIdentity(keptEnv, hash, identity, "ok");
  await changed();
}
