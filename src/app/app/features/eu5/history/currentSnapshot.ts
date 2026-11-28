import { useStore } from "zustand";
import { localSaveRegistry } from "@/features/campaign/localSaves";
import { useEu5Context, useEu5PlaythroughId } from "../store";
import { useMapHistory } from "./context";
import { loadedSnapshotId } from "./previewSession";
import { useHistory } from "./store";

export function useCurrentHistorySnapshot() {
  const store = useEu5Context();
  const campaignId = useEu5PlaythroughId();
  const preview = useMapHistory()?.preview;
  useHistory((state) => state.sources);
  localSaveRegistry.useEntries();
  const loaded = useStore(store, () => loadedSnapshotId(store));
  const id = preview ? (preview.shown?.snapshotId ?? loaded) : loaded;
  return useHistory((state) =>
    state.snapshots.find((snapshot) => snapshot.id === id && snapshot.campaignId === campaignId),
  );
}
