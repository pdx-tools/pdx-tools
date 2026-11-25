import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { sameDate } from "@/features/timeline/date";
import { captureException } from "@/lib/captureException";
import { readSaveIdentity } from "./reader";
import type { SaveGameInput } from "@/features/engine/engineStore";
import type { KeptSave } from "@/features/keptSaves/types";
import { fileVersion, KEPT_BATCH, localSaveName, sameFileVersion } from "./types";
import type {
  CampaignGame,
  FileVersion,
  LocalSaveProblem,
  LocalSaveRef,
  OpenSave,
  SaveIdentity,
} from "./types";

/** A local save available during this browser session. */
export type LocalSaveEntry = Readonly<{
  id: string;
  game: CampaignGame;
  ref: LocalSaveRef;
  name: string;
  /** Null until the metadata is read. */
  identity: SaveIdentity | null;
  /** The file version associated with the cached identity. */
  version: FileVersion | null;
  problem: LocalSaveProblem | null;
  /** Files selected together remain associated while their campaign identity is unknown. */
  batch: number;
  /** The SHA-256 of the bytes that the identity is of. */
  hash: string | null;
  /** The copy that `ref` points at. */
  kept: KeptSave | null;
  uploadedId: string | null;
}>;

function indexEntries(game: CampaignGame, entries: readonly LocalSaveEntry[]) {
  const byReference = new Map<File | FileSystemFileHandle, LocalSaveEntry>();
  const byFile = new Map<string, LocalSaveEntry>();
  const byHandleName = new Map<string, LocalSaveEntry[]>();
  const fileKey = (file: File) => JSON.stringify([file.name, file.size, file.lastModified]);

  const add = (entry: LocalSaveEntry) => {
    if (entry.game !== game) return;
    byReference.set(entry.ref.file, entry);
    if (entry.ref.kind === "file") {
      byFile.set(fileKey(entry.ref.file), entry);
    } else {
      // A file that the player picks is never in the storage of the copies.
      if (entry.kept !== null) return;
      const name = localSaveName(entry.ref);
      const candidates = byHandleName.get(name) ?? [];
      candidates.push(entry);
      byHandleName.set(name, candidates);
    }
  };
  for (const entry of entries) add(entry);

  const find = async (ref: LocalSaveRef): Promise<LocalSaveEntry | undefined> => {
    const exact = byReference.get(ref.file);
    if (exact !== undefined) return exact;
    if (ref.kind === "file") return byFile.get(fileKey(ref.file));
    const candidates = byHandleName.get(localSaveName(ref)) ?? [];
    const matches = await Promise.all(
      candidates.map((entry) =>
        entry.ref.kind === "handle" ? ref.file.isSameEntry(entry.ref.file) : false,
      ),
    );
    return candidates[matches.indexOf(true)];
  };
  return { add, find };
}

/** Keep local file references, metadata, and verification in one registry. */
export function createLocalSaveRegistry(
  readSaveIdentity: (game: CampaignGame, file: File) => Promise<SaveIdentity>,
) {
  const store = createStore<{ entries: readonly LocalSaveEntry[]; batch: number }>()(() => ({
    entries: [],
    batch: 0,
  }));
  let nextId = 0;
  const references = {
    eu4: new WeakMap<File | FileSystemFileHandle, string>(),
    eu5: new WeakMap<File | FileSystemFileHandle, string>(),
  };
  const revisions = new Map<string, number>();
  let registrations: Promise<unknown> = Promise.resolve();

  /** Reuse known entries and return them in selection order. */
  function registerLocalSaves(
    game: CampaignGame,
    refs: readonly LocalSaveRef[],
  ): Promise<LocalSaveEntry[]> {
    const selection = [...refs];
    const result = registrations.then(() => registerBatch(game, selection));
    registrations = result.catch(() => {});
    return result;
  }

  async function registerBatch(
    game: CampaignGame,
    refs: readonly LocalSaveRef[],
  ): Promise<LocalSaveEntry[]> {
    const batch = store.getState().batch + 1;
    const result: LocalSaveEntry[] = [];
    const added: LocalSaveEntry[] = [];
    const files = new Map<LocalSaveRef, Promise<File | null>>();
    const index = indexEntries(game, store.getState().entries);
    for (const ref of refs) {
      const match = await index.find(ref);
      if (match && ref.kind === "handle" && match.version !== null) {
        files.set(
          ref,
          ref.file.getFile().catch(() => null),
        );
      }
      if (match) {
        result.push(match);
        continue;
      }

      const entry: LocalSaveEntry = {
        id: `local-${nextId++}`,
        game,
        ref,
        name: localSaveName(ref),
        identity: null,
        version: null,
        problem: null,
        batch,
        hash: null,
        kept: null,
        uploadedId: null,
      };
      added.push(entry);
      index.add(entry);
      result.push(entry);
    }

    const selected = new Map(
      result.map((entry, i) => [entry.id, { ref: refs[i], previous: entry }]),
    );
    const resolvedFiles = new Map(
      await Promise.all([...files].map(async ([ref, file]) => [ref, await file] as const)),
    );
    for (const [id, { ref }] of selected) {
      revisions.set(id, (revisions.get(id) ?? 0) + 1);
      references[game].set(ref.file, id);
    }
    const refreshed = new Map<string, LocalSaveEntry>();
    const entries = [...store.getState().entries, ...added].map((entry) => {
      const selection = selected.get(entry.id);
      if (!selection) return entry;
      const { ref, previous } = selection;
      const file = resolvedFiles.get(ref);
      const invalidate =
        ref.kind === "handle" &&
        entry.identity === previous.identity &&
        (file == null || entry.version === null || !sameFileVersion(file, entry.version));
      const next = {
        ...entry,
        ref,
        name: localSaveName(ref),
        problem: null,
        batch,
        ...(invalidate && { identity: null, version: null, hash: null, uploadedId: null }),
      };
      refreshed.set(entry.id, next);
      return next;
    });
    store.setState({ batch, entries });
    return result.map((entry) => refreshed.get(entry.id) ?? entry);
  }

  function updateEntry(id: string, update: Partial<LocalSaveEntry>) {
    store.setState((state) => ({
      entries: state.entries.map((entry) => (entry.id === id ? { ...entry, ...update } : entry)),
    }));
  }

  function setLocalSaveIdentity(
    id: string,
    identity: SaveIdentity,
    version: FileVersion | null = null,
    hash: string | null = null,
  ): void {
    const entry = getLocalSave(id);
    const next = { identity, version: version && fileVersion(version), problem: null };
    // The bytes of a kept save do not change.
    // An upload was of the version that the entry had.
    const isReplaced =
      entry?.version && next.version && !sameFileVersion(entry.version, next.version);
    updateEntry(id, {
      ...next,
      hash: entry?.kept?.hash ?? hash,
      ...(isReplaced && { uploadedId: null }),
    });
  }

  function setLocalSaveProblem(id: string, problem: LocalSaveProblem | null): void {
    updateEntry(id, { problem });
  }

  function getLocalSave(id: string): LocalSaveEntry | undefined {
    return store.getState().entries.find((x) => x.id === id);
  }

  async function readEntryFile(entry: LocalSaveEntry): Promise<File> {
    return entry.ref.kind === "handle" ? await entry.ref.file.getFile() : entry.ref.file;
  }

  /** Share pending metadata reads for each entry. */
  const queuedReads = new Map<string, Promise<void>>();

  function readIdentity(id: string): Promise<void> {
    const pending = queuedReads.get(id);
    if (pending) return pending;
    const result = readPendingIdentity(id).finally(() => queuedReads.delete(id));
    queuedReads.set(id, result);
    return result;
  }

  async function readPendingIdentity(id: string): Promise<void> {
    const entry = getLocalSave(id);
    if (entry === undefined || entry.identity !== null || entry.problem !== null) return;
    const revision = revisions.get(id);

    let file: File;
    try {
      file = await readEntryFile(entry);
    } catch {
      if (revisions.get(id) !== revision) return readPendingIdentity(id);
      if (getLocalSave(id)?.identity === null) setLocalSaveProblem(id, { kind: "missing" });
      return;
    }

    try {
      const identity = await readSaveIdentity(entry.game, file);
      const current = getLocalSave(id);
      if (revisions.get(id) !== revision) return readPendingIdentity(id);
      // A completed load provides a more precise identity than a metadata read.
      if (current?.identity === null) setLocalSaveIdentity(id, identity, fileVersion(file));
    } catch (error) {
      if (revisions.get(id) !== revision) return readPendingIdentity(id);
      if (getLocalSave(id)?.identity === null) setLocalSaveProblem(id, { kind: "unreadable" });
      captureException(error, { tags: { msg: "campaign-identity" } });
    }
  }

  /** Verify a timeline point before leaving the current save. */
  async function verify(id: string): Promise<LocalSaveProblem | null> {
    const entry = getLocalSave(id);
    if (!entry) return { kind: "missing" };
    const revision = revisions.get(id);
    const fail = (problem: LocalSaveProblem) => {
      if (revisions.get(id) !== revision) return verify(id);
      setLocalSaveProblem(entry.id, problem);
      return problem;
    };

    if (entry.kept !== null && entry.ref.kind === "handle") {
      const file = await entry.ref.file.getFile().catch(() => null);
      return file?.size === entry.kept.size ? null : fail({ kind: "copy-missing" });
    }

    if (entry.ref.kind === "file") {
      // Check that the browser can still read the selected file.
      try {
        await entry.ref.file.slice(0, 1).arrayBuffer();
        if (revisions.get(id) !== revision) return verify(id);
        if (getLocalSave(id)?.problem !== null) setLocalSaveProblem(id, null);
        return null;
      } catch {
        return fail({ kind: "missing" });
      }
    }

    let file: File;
    try {
      file = await entry.ref.file.getFile();
    } catch {
      return fail({ kind: "missing" });
    }

    if (revisions.get(id) !== revision) return verify(id);
    let current = getLocalSave(id)!;

    // Reuse cached metadata only when the file version matches.
    let identity: SaveIdentity;
    if (
      current.identity !== null &&
      current.version !== null &&
      sameFileVersion(file, current.version)
    ) {
      identity = current.identity;
    } else {
      try {
        identity = await readSaveIdentity(entry.game, file);
      } catch {
        return fail({ kind: "unreadable" });
      }
    }

    if (revisions.get(id) !== revision) return verify(id);
    current = getLocalSave(id)!;
    if (
      current.identity !== entry.identity &&
      current.identity !== null &&
      sameDate(current.identity.date, identity.date)
    ) {
      identity = current.identity;
    }
    if (current.identity && !sameDate(identity.date, current.identity.date)) {
      const problem: LocalSaveProblem = { kind: "moved", from: current.identity.date };
      updateEntry(entry.id, {
        identity,
        version: fileVersion(file),
        problem,
        hash: null,
        uploadedId: null,
      });
      return problem;
    }

    // Cache the verified version and clear resolved file warnings.
    if (current.version === null || !sameFileVersion(file, current.version)) {
      setLocalSaveIdentity(entry.id, identity, fileVersion(file));
    } else if (current.problem !== null) {
      setLocalSaveProblem(entry.id, null);
    }
    return null;
  }

  /**
   * Record the identity of the save that the viewer parsed, unless the entry
   * already holds a later read of the file.
   */
  function observeOpen(open: OpenSave): void {
    if (open.source.kind !== "local") return;
    if (open.source.entryId === null) return;
    const entry = getLocalSave(open.source.entryId);
    if (!entry || entry.game !== open.game) return;
    const version = open.source.fileVersion;
    if (
      version !== null &&
      entry.version !== null &&
      version.lastModified < entry.version.lastModified
    )
      return;
    const identity: SaveIdentity = {
      playthroughId: open.playthroughId,
      campaignIdHint: open.campaignIdHint,
      date: open.date,
    };
    const known = entry.identity;
    const sameVersion =
      version === entry.version ||
      (version !== null && entry.version !== null && sameFileVersion(version, entry.version));
    if (
      known?.playthroughId === identity.playthroughId &&
      known.campaignIdHint === identity.campaignIdHint &&
      sameDate(known.date, identity.date) &&
      sameVersion &&
      (open.source.hash === null || open.source.hash === entry.hash)
    )
      return;
    setLocalSaveIdentity(entry.id, identity, version, open.source.hash);
  }

  /** Add an entry for a kept copy that has none. */
  function addKept(save: KeptSave, file: FileSystemFileHandle): LocalSaveEntry {
    const current = findKept(save.hash);
    if (current !== undefined) return current;
    const entry: LocalSaveEntry = {
      id: `local-${nextId++}`,
      game: save.game,
      ref: { kind: "handle", file, name: save.name },
      name: save.name,
      identity: keptIdentity(save),
      version: { size: save.size, lastModified: save.opfsModified },
      problem: null,
      batch: KEPT_BATCH,
      hash: save.hash,
      kept: save,
      uploadedId: null,
    };
    references[save.game].set(file, entry.id);
    store.setState(({ entries }) => ({ entries: [...entries, entry] }));
    return entry;
  }

  const findKept = (hash: string) => store.getState().entries.find((x) => x.kept?.hash === hash);

  /** Give each kept save with a known date an entry, and remove the deleted ones. */
  async function syncKept(
    saves: readonly KeptSave[],
    handleOf: (hash: string) => Promise<FileSystemFileHandle | null>,
  ): Promise<void> {
    const listed = new Set(store.getState().entries.map((entry) => entry.kept?.hash));
    const handles = await Promise.all(
      saves
        .filter((save) => save.date !== null && !listed.has(save.hash))
        .map(async (save) => [save, await handleOf(save.hash)] as const),
    );
    const byHash = new Map(saves.map((save) => [save.hash, save]));
    store.setState(({ entries }) => ({
      entries: entries.flatMap((entry) => {
        if (entry.kept === null) return [entry];
        const save = byHash.get(entry.kept.hash);
        if (save === undefined) return [];
        return [{ ...entry, kept: save, identity: keptIdentity(save) ?? entry.identity }];
      }),
    }));
    for (const [save, file] of handles) if (file !== null) addKept(save, file);
  }

  /** Point an entry at the kept copy of its bytes, and drop the entry of the copy. */
  function adopt(id: string, kept: KeptSave, ref: LocalSaveRef): void {
    const entry = getLocalSave(id);
    if (entry === undefined) return;
    references[entry.game].delete(entry.ref.file);
    references[entry.game].set(ref.file, id);
    revisions.set(id, (revisions.get(id) ?? 0) + 1);
    const { hash, size, opfsModified } = kept;
    const version = { size, lastModified: opfsModified };
    store.setState(({ entries }) => ({
      entries: entries.flatMap((x) => {
        if (x.id === id) return [{ ...x, ref, version, kept, hash, problem: null }];
        return x.kept?.hash === hash ? [] : [x];
      }),
    }));
  }

  return {
    register: registerLocalSaves,
    sourceFor: (
      game: CampaignGame,
      ref: LocalSaveRef,
      parsedVersion: FileVersion | null = ref.kind === "file" ? ref.file : null,
      hash: string | null = null,
    ): Extract<OpenSave["source"], { kind: "local" }> => {
      const entryId = references[game].get(ref.file) ?? null;
      return {
        kind: "local",
        ref,
        entryId,
        fileVersion: parsedVersion === null ? null : fileVersion(parsedVersion),
        hash: hash ?? getLocalSave(entryId ?? "")?.kept?.hash ?? null,
      };
    },
    get: getLocalSave,
    recordIdentity: setLocalSaveIdentity,
    readIdentity,
    /** Pair an upload with the entry that it was sent from, unless the entry has other bytes now. */
    recordUpload: (sent: LocalSaveEntry, hash: string | null, uploadedId: string) => {
      const entry = getLocalSave(sent.id);
      if (entry === undefined) return;
      const sameBytes =
        hash !== null && entry.hash !== null
          ? entry.hash === hash
          : entry.version === sent.version ||
            (entry.version && sent.version && sameFileVersion(entry.version, sent.version));
      if (sameBytes) updateEntry(sent.id, { uploadedId });
    },
    verify,
    observeOpen,
    syncKept,
    adopt,
    remove: (id: string) =>
      store.setState(({ entries }) => ({ entries: entries.filter((x) => x.id !== id) })),
    entryOf: (game: CampaignGame, ref: LocalSaveRef) =>
      getLocalSave(references[game].get(ref.file) ?? ""),
    findKept,
    addKept,
    entries: () => store.getState().entries,
    subscribe: (listener: () => void) => store.subscribe(listener),
    /** Record the content of a file, unless the entry is for a later version of it. */
    recordHash: (id: string, version: FileVersion, hash: string) => {
      const entry = getLocalSave(id);
      if (entry?.version && sameFileVersion(entry.version, version)) updateEntry(id, { hash });
    },
    useEntries: () => useStore(store, (state) => state.entries),
  };
}

function keptIdentity(save: KeptSave): SaveIdentity | null {
  const { playthroughId, campaignIdHint, date } = save;
  return date && { playthroughId, campaignIdHint, date };
}

export type LocalSaveRegistry = ReturnType<typeof createLocalSaveRegistry>;

export const localSaveRegistry = createLocalSaveRegistry(readSaveIdentity);
export const registerLocalSaves = localSaveRegistry.register;

export function localSaveInput(game: CampaignGame, ref: LocalSaveRef): SaveGameInput {
  return game === "eu4" ? { kind: "eu4", data: ref } : { kind: "eu5", data: ref };
}

/** Match the registered file reference before attaching an analysis result. */
export function holdsRef(entry: LocalSaveEntry, ref: LocalSaveRef): boolean {
  return entry.ref.kind === ref.kind && entry.ref.file === ref.file;
}
