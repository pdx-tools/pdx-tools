import { create } from "zustand";
import type { SaveGameInput } from "@/features/engine/engineStore";
import { localSaveName } from "./types";
import type { CampaignGame, LocalSaveProblem, LocalSaveRef, SaveIdentity } from "./types";

/** A save file that the player gave the page in this session. */
export type LocalSaveEntry = {
  id: string;
  game: CampaignGame;
  ref: LocalSaveRef;
  name: string;
  /** Null until the metadata is read. */
  identity: SaveIdentity | null;
  /** The file that the page read the identity from. Null when it read no file. */
  version: FileVersion | null;
  problem: LocalSaveProblem | null;
  /**
   * The drop or pick that gave the file. The page shows the files of one
   * batch as one campaign until a read tells otherwise.
   */
  batch: number;
};

/** The size and time of a file, which change when the game writes over it. */
export type FileVersion = { size: number; lastModified: number };

export function fileVersion(file: File): FileVersion {
  return { size: file.size, lastModified: file.lastModified };
}

export function sameFileVersion(file: File, version: FileVersion): boolean {
  return file.size === version.size && file.lastModified === version.lastModified;
}

type LocalSavesState = {
  entries: LocalSaveEntry[];
  /** The latest batch of files. */
  batch: number;
  /** The key of the campaign save that is being opened. */
  opening: string | null;
  openingToken: symbol | null;
};

const useLocalSavesStore = create<LocalSavesState>()(() => ({
  entries: [],
  batch: 0,
  opening: null,
  openingToken: null,
}));

let nextId = 0;

/** Index files by their metadata and handles by their name. */
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

let registrations: Promise<unknown> = Promise.resolve();

/**
 * Keep the files for the campaign of the save that opens. A file that the
 * page has already has its entry returned; it is not added again. Returns
 * the entries in the order of `refs`.
 */
export function registerLocalSaves(
  game: CampaignGame,
  refs: LocalSaveRef[],
): Promise<LocalSaveEntry[]> {
  const result = registrations.then(() => registerBatch(game, refs));
  registrations = result.catch(() => {});
  return result;
}

async function registerBatch(game: CampaignGame, refs: LocalSaveRef[]): Promise<LocalSaveEntry[]> {
  const batch = useLocalSavesStore.getState().batch + 1;
  const result: LocalSaveEntry[] = [];
  const added: LocalSaveEntry[] = [];
  const index = indexEntries(game, useLocalSavesStore.getState().entries);
  for (const ref of refs) {
    const match = await index.find(ref);
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
    };
    added.push(entry);
    index.add(entry);
    result.push(entry);
  }

  // A file given again can be checked again.
  const selected = new Set(result.map((entry) => entry.id));
  const refreshed = new Map<string, LocalSaveEntry>();
  useLocalSavesStore.setState((state) => ({
    batch,
    entries: [...state.entries, ...added].map((entry) => {
      if (!selected.has(entry.id)) return entry;
      const next = { ...entry, problem: null, batch };
      refreshed.set(entry.id, next);
      return next;
    }),
  }));
  return result.map((entry) => refreshed.get(entry.id) ?? entry);
}

function updateEntry(id: string, update: Partial<LocalSaveEntry>) {
  useLocalSavesStore.setState((state) => ({
    entries: state.entries.map((entry) => (entry.id === id ? { ...entry, ...update } : entry)),
  }));
}

export function setLocalSaveIdentity(
  id: string,
  identity: SaveIdentity,
  version: FileVersion | null = null,
): void {
  updateEntry(id, { identity, version, problem: null });
}

export function setLocalSaveProblem(id: string, problem: LocalSaveProblem | null): void {
  updateEntry(id, { problem });
}

/** The game wrote a later save over the file; the entry moves to the date of `identity`. */
export function moveLocalSave(
  id: string,
  identity: SaveIdentity,
  version: FileVersion,
  problem: LocalSaveProblem,
): void {
  updateEntry(id, { identity, version, problem });
}

export function getLocalSave(id: string): LocalSaveEntry | undefined {
  return useLocalSavesStore.getState().entries.find((x) => x.id === id);
}

/** True when the entry holds this exact reference: the one that a save opened from. */
export function holdsRef(entry: LocalSaveEntry, ref: LocalSaveRef): boolean {
  return entry.ref.kind === ref.kind && entry.ref.file === ref.file;
}

/** The input that opens a local save. */
export function localSaveInput(game: CampaignGame, ref: LocalSaveRef): SaveGameInput {
  return game === "eu4" ? { kind: "eu4", data: ref } : { kind: "eu5", data: ref };
}

/** Reserve the next step before an asynchronous operation starts. */
export function beginCampaignOpening(key: string): (() => void) | null {
  if (useLocalSavesStore.getState().opening !== null) return null;
  const token = Symbol("campaign opening");
  useLocalSavesStore.setState({ opening: key, openingToken: token });
  return () => {
    if (useLocalSavesStore.getState().openingToken === token) setCampaignOpening(null);
  };
}

export function setCampaignOpening(key: string | null): void {
  useLocalSavesStore.setState({ opening: key, openingToken: null });
}

export const useLocalSaves = () => useLocalSavesStore((x) => x.entries);
export const useCampaignOpening = () => useLocalSavesStore((x) => x.opening);
