import { localSaveRegistry, holdsRef } from "@/features/campaign/localSaves";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import { fileVersion, sameFileVersion, toPlaythroughId } from "@/features/campaign/types";
import { descriptorDate } from "./descriptor";
import type { SnapshotDescriptor, SourceAssociation } from "./descriptor";

/** A local save entry and the file that the import reads. */
export type CampaignSource = { entry: LocalSaveEntry; file: File };

/** Read the file of each entry. Stop waiting when the signal aborts. */
export async function readSources(entries: readonly LocalSaveEntry[], signal: AbortSignal) {
  const { promise: aborted, reject } = Promise.withResolvers<never>();
  const onAbort = () => reject(new DOMException("Import cancelled", "AbortError"));
  signal.throwIfAborted();
  signal.addEventListener("abort", onAbort, { once: true });
  void aborted.catch(() => {});
  try {
    const results = await Promise.race([
      Promise.allSettled(
        entries.map(async (entry) =>
          entry.ref.kind === "handle" ? await entry.ref.file.getFile() : entry.ref.file,
        ),
      ),
      aborted,
    ]);
    const sources: CampaignSource[] = [];
    const failures: { entry: LocalSaveEntry; error: string }[] = [];
    results.forEach((result, i) => {
      if (result.status === "fulfilled") sources.push({ entry: entries[i], file: result.value });
      else failures.push({ entry: entries[i], error: String(result.reason) });
    });
    return { sources, failures };
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

/** Group sources by the file that the import reads. Entries can share one file. */
export function sourcesByFile(sources: readonly CampaignSource[]) {
  const byFile = new Map<File, CampaignSource[]>();
  for (const source of sources)
    byFile.set(source.file, [...(byFile.get(source.file) ?? []), source]);
  return byFile;
}

/**
 * The current registry entry of a source, or null when the import must not
 * publish to it: the entry was removed or replaced, or navigation read a
 * newer version of its file handle than the file that was parsed.
 */
export function currentEntry(entry: LocalSaveEntry, parsedFile?: File): LocalSaveEntry | null {
  const current = localSaveRegistry.get(entry.id);
  if (!current || !holdsRef(current, entry.ref)) return null;
  const versionChanged =
    !!current.version && (!entry.version || !sameFileVersion(current.version, entry.version));
  if (parsedFile && versionChanged && !sameFileVersion(parsedFile, current.version!)) return null;
  return current;
}

/**
 * Record the campaign identity of each current entry of the parsed file, and
 * return their source associations.
 */
export function associateSources(
  sources: readonly CampaignSource[],
  parsedFile: File,
  descriptor: SnapshotDescriptor,
): Record<string, SourceAssociation> {
  const associations: Record<string, SourceAssociation> = {};
  const version = fileVersion(parsedFile);
  for (const { entry } of sources) {
    if (!currentEntry(entry, parsedFile)) continue;
    localSaveRegistry.recordIdentity(
      entry.id,
      {
        playthroughId: toPlaythroughId(descriptor.campaignId),
        campaignIdHint: null,
        date: descriptorDate(descriptor),
      },
      version,
    );
    associations[entry.id] = { snapshotId: descriptor.id, version };
  }
  return associations;
}
