import { localSaveRegistry, holdsRef } from "@/features/campaign/localSaves";
import { sameFileVersion } from "@/features/campaign/types";
import {
  useEu5AppState,
  useEu5Input,
  useEu5PlaythroughId,
  useEu5SaveDate,
  useEu5SaveInput,
} from "../store";
import { useHistory } from "./store";
import type { SourceObservation } from "./store";
import type { SnapshotMetadata } from "./types";

export function currentHistorySnapshot(
  snapshots: SnapshotMetadata[],
  current: {
    campaignId: string | null;
    version: string | undefined;
    dateSort: number;
    remote: boolean;
    file?: File;
    source?: SourceObservation;
  },
): SnapshotMetadata | undefined {
  if (
    !current.remote &&
    (!current.source || !current.file || !sameFileVersion(current.file, current.source.version))
  )
    return;
  const matches = snapshots.filter(
    (snapshot) =>
      snapshot.campaignId === current.campaignId &&
      snapshot.version === current.version &&
      snapshot.dateSort === current.dateSort &&
      (current.remote || snapshot.hash === current.source?.hash),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/** Both inline and expanded history must identify the same parsed file version. */
export function useCurrentHistorySnapshot(version: string | undefined) {
  const projection = useEu5AppState().mapProjection;
  const snapshots = useHistory((state) => state.snapshots);
  const sources = useHistory((state) => state.sources);
  const entries = localSaveRegistry.useEntries();
  const input = useEu5Input();
  const parsed = useEu5SaveInput();
  const campaignId = useEu5PlaythroughId();
  const date = useEu5SaveDate();
  const entry =
    input.kind === "server"
      ? undefined
      : entries.find((entry) => entry.game === "eu5" && holdsRef(entry, input));
  if (projection) return snapshots.find((snapshot) => snapshot.hash === projection.hash);
  return currentHistorySnapshot(snapshots, {
    campaignId,
    version,
    dateSort: date.year * 10000 + date.month * 100 + date.day,
    remote: input.kind === "server",
    file: parsed.kind === "file" ? parsed.file : undefined,
    source: entry && sources[entry.id],
  });
}
