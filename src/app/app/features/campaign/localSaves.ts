import { create } from "zustand";
import type { CampaignGame, LocalSaveProblem, LocalSaveRef, SaveHeader } from "./types";

/** A save file that the player gave the page in this session. */
export type LocalSaveEntry = {
  id: string;
  game: CampaignGame;
  ref: LocalSaveRef;
  name: string;
  /** Null until the header is read. */
  header: SaveHeader | null;
  problem: LocalSaveProblem | null;
  /** The drop or pick that gave the file, so that its result can be told. */
  batch: number;
};

type LocalSavesState = {
  entries: LocalSaveEntry[];
  /** The latest batch of files. */
  batch: number;
  /** The key of the campaign save that is being opened. */
  opening: string | null;
};

const useLocalSavesStore = create<LocalSavesState>()(() => ({
  entries: [],
  batch: 0,
  opening: null,
}));

let nextId = 0;

export function localRefName(ref: LocalSaveRef): string {
  return ref.kind === "handle" ? ref.name : ref.file.name;
}

async function sameRef(a: LocalSaveRef, b: LocalSaveRef): Promise<boolean> {
  if (a.kind === "handle" && b.kind === "handle") {
    return a.handle === b.handle || (await a.handle.isSameEntry(b.handle));
  }
  if (a.kind === "file" && b.kind === "file") {
    return (
      a.file === b.file ||
      (a.file.name === b.file.name &&
        a.file.size === b.file.size &&
        a.file.lastModified === b.file.lastModified)
    );
  }
  return false;
}

/**
 * Keep the files for the campaign of the save that opens. A file that the
 * page has already has its entry returned; it is not added again. Returns
 * the entries in the order of `refs`.
 */
export async function registerLocalSaves(
  game: CampaignGame,
  refs: LocalSaveRef[],
): Promise<LocalSaveEntry[]> {
  const batch = useLocalSavesStore.getState().batch + 1;
  const result: LocalSaveEntry[] = [];
  const added: LocalSaveEntry[] = [];
  for (const ref of refs) {
    const known = [...useLocalSavesStore.getState().entries, ...added];
    let match: LocalSaveEntry | undefined;
    for (const entry of known) {
      if (entry.game === game && (await sameRef(entry.ref, ref))) {
        match = entry;
        break;
      }
    }

    if (match) {
      result.push(match);
      continue;
    }

    const entry: LocalSaveEntry = {
      id: `local-${nextId++}`,
      game,
      ref,
      name: localRefName(ref),
      header: null,
      problem: null,
      batch,
    };
    added.push(entry);
    result.push(entry);
  }

  useLocalSavesStore.setState((state) => ({
    batch,
    // A file given again is a request to read it again.
    entries: [
      ...state.entries.map((entry) =>
        result.includes(entry) ? { ...entry, problem: null, batch } : entry,
      ),
      ...added,
    ],
  }));
  return result.map((entry) => entryById(entry.id));
}

function entryById(id: string): LocalSaveEntry {
  const entry = useLocalSavesStore.getState().entries.find((x) => x.id === id);
  if (entry === undefined) throw new Error(`unknown local save ${id}`);
  return entry;
}

function updateEntry(id: string, update: Partial<LocalSaveEntry>) {
  useLocalSavesStore.setState((state) => ({
    entries: state.entries.map((entry) => (entry.id === id ? { ...entry, ...update } : entry)),
  }));
}

export function setLocalSaveHeader(id: string, header: SaveHeader): void {
  updateEntry(id, { header, problem: null });
}

export function setLocalSaveProblem(id: string, problem: LocalSaveProblem | null): void {
  updateEntry(id, { problem });
}

/** The game wrote a later save over the file; the entry moves to its date. */
export function moveLocalSave(id: string, header: SaveHeader): void {
  const entry = useLocalSavesStore.getState().entries.find((x) => x.id === id);
  const from = entry?.header?.date;
  updateEntry(id, { header, problem: from ? { kind: "moved", from } : null });
}

export function getLocalSave(id: string): LocalSaveEntry | undefined {
  return useLocalSavesStore.getState().entries.find((x) => x.id === id);
}

/** True when the entry holds this exact reference: the one that a save opened from. */
export function holdsRef(entry: LocalSaveEntry, ref: LocalSaveRef): boolean {
  return entry.ref.kind === "handle"
    ? ref.kind === "handle" && entry.ref.handle === ref.handle
    : ref.kind === "file" && entry.ref.file === ref.file;
}

export function setCampaignOpening(key: string | null): void {
  useLocalSavesStore.setState({ opening: key });
}

export const useLocalSaves = () => useLocalSavesStore((x) => x.entries);
export const useLocalSavesBatch = () => useLocalSavesStore((x) => x.batch);
export const useCampaignOpening = () => useLocalSavesStore((x) => x.opening);
