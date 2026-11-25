import { isDomException } from "./bytes";
import type { FileVersion, PlaythroughId } from "@/features/campaign/types";
import type { FileStat, ManifestEntry, NewestFile } from "./types";

/** The files of a folder by path, as one listing found them. */
export type Listing = ReadonlyMap<string, FileStat>;

/** A rotation changes its paths together. */
const ROTATION_MS = 5000;

export const sameStat = (a: FileStat, b: FileStat) => a.size === b.size && a.mtime === b.mtime;

/** How many files are read to find the last save of a campaign. */
const NEWEST_FILES = 5;

export function newestFiles(listing: Listing): NewestFile[] {
  return Array.from(listing, ([path, { size, mtime }]) => ({
    path,
    size,
    mtime,
    playthroughId: null,
  }))
    .toSorted((a, b) => b.mtime - a.mtime)
    .slice(0, NEWEST_FILES);
}

/** Read the campaign of each file. A file that is gone is not newer than another one. */
export async function identifyFiles(
  files: readonly NewestFile[],
  read: (file: NewestFile) => Promise<PlaythroughId | null>,
): Promise<NewestFile[]> {
  const found = await Promise.all(
    files.map(async (file) => {
      try {
        return [{ ...file, playthroughId: await read(file) }];
      } catch (error) {
        return isDomException(error, "NotFoundError") ? [] : [file];
      }
    }),
  );
  return found.flat();
}

/**
 * Whether a file was the last one of its campaign at the start of the watch.
 * A later file that could not be read could be of the campaign too.
 */
export function wasNewest(
  newest: readonly NewestFile[],
  version: FileVersion,
  playthroughId: string | null,
): boolean {
  for (const file of newest) {
    if (file.size === version.size && file.mtime === version.lastModified) return true;
    if (file.playthroughId === null || file.playthroughId === playthroughId) return false;
  }
  return false;
}

/** Accept the files of a folder as they are, so only later writes are read. */
export function seedManifest(listing: Listing): ManifestEntry[] {
  return Array.from(listing, ([path, { size, mtime }]) => ({
    path,
    size,
    mtime,
    hash: null,
    previous: null,
    state: "held",
    changedAt: 0,
  }));
}

function holds(entry: ManifestEntry, listing: Listing): boolean {
  const stat = listing.get(entry.path);
  return stat !== undefined && sameStat(stat, entry);
}

/** Compare a listing with the manifest. Give the paths to read, oldest write first. */
export function compareFolder(
  manifest: readonly ManifestEntry[],
  listing: Listing,
  now: number,
): { manifest: ManifestEntry[]; changed: string[] } {
  const byPath = new Map(manifest.map((entry) => [entry.path, entry]));
  const next = new Map(
    manifest.map((entry): [string, ManifestEntry] => {
      if (holds(entry, listing)) return [entry.path, { ...entry, state: "held" }];
      const state = listing.has(entry.path) ? "changed" : "gone";
      const changedAt = entry.state === "held" ? now : entry.changedAt;
      return [entry.path, { ...entry, state, changedAt }];
    }),
  );
  const changed: string[] = [];
  for (const [path, stat] of listing) {
    const entry = byPath.get(path);
    if (entry !== undefined && sameStat(stat, entry)) continue;
    // A seeded file that the game renames is still a file from before the watch.
    const renamed = manifest.find(
      (x) => x.hash === null && x.path !== path && sameStat(x, stat) && !holds(x, listing),
    );
    if (renamed === undefined) changed.push(path);
    else next.set(path, { ...renamed, path, state: "held" });
  }
  changed.sort((a, b) => listing.get(a)!.mtime - listing.get(b)!.mtime);
  return { manifest: [...next.values()], changed };
}

/**
 * Record the content of a path. `isWrite` is false for content that only
 * changed its path, such as an autosave that the game rotates, or a copy of a
 * known save under a new name. Modification times do not decide it: restoring
 * a backup can keep the time of the backup.
 */
export function recordContent(
  manifest: readonly ManifestEntry[],
  { path, hash, ...stat }: FileStat & { path: string; hash: string },
  { known, listing, now }: { known: boolean; listing: Listing; now: number },
): { manifest: ManifestEntry[]; isWrite: boolean } {
  const current = manifest.find((entry) => entry.path === path);
  const changedAt = current?.state === "held" ? now : (current?.changedAt ?? now);
  const source = manifest.find((entry) => {
    if (entry.path === path) return false;
    const isLeft = entry.hash === hash && !holds(entry, listing);
    const leftAt = isLeft && entry.state === "held" ? now : entry.changedAt;
    // Content that left its path long ago does not explain this one.
    return (isLeft || entry.previous === hash) && Math.abs(leftAt - changedAt) <= ROTATION_MS;
  });
  const unchanged = current?.hash === hash;
  const copied = known && current === undefined;
  const isWrite = !unchanged && !(known && source !== undefined) && !copied;
  const next = manifest
    .filter((entry) => entry.path !== path)
    .map((entry) => {
      if (entry !== source) return entry;
      // The content went to this path, so it cannot explain another one.
      return { ...entry, hash: entry.hash === hash ? null : entry.hash, previous: null };
    });
  next.push({
    ...stat,
    path,
    hash,
    previous: unchanged ? current.previous : (current?.hash ?? null),
    state: "held",
    changedAt,
  });
  return { manifest: next, isWrite };
}
