import { useCallback } from "react";
import { useEu5Context, useEu5Engine } from "../store";
import { useHistory } from "./store";

/** Change a save inside the running viewer; never replace the engine or canvas. */
export function useSnapshotSwitch() {
  const store = useEu5Context();
  const engine = useEu5Engine();
  return useCallback(
    async (hash: string) => {
      const history = useHistory.getState();
      const file = history.files[hash];
      if (!file || history.switching || hash === history.selectedHash) return;
      history.setSwitching(true);
      try {
        history.clearSnapshotFailure(hash);
        const result = await engine.trigger.switchSnapshot(file, hash, history.viewedProfile);
        const { metadata } = result;
        store.setState({
          saveInput: { kind: "file", file },
          filename: file.name,
          saveDate: metadata.date,
          playthroughName: metadata.playthroughName,
          players: metadata.players,
          world: metadata.world,
          uploadedSaveId: null,
        });
        useHistory.getState().setViewedProfile(result.viewedProfile);
        useHistory.getState().select(hash);
        useHistory.getState().setTiming(result.milliseconds, result.cacheHit);
      } catch (error) {
        // Keep the active canvas and selected date. Playback advances past this hash.
        useHistory.getState().markSnapshotFailed(hash, `${file.name}: ${String(error)}`);
      } finally {
        useHistory.getState().setSwitching(false);
      }
    },
    [engine, store],
  );
}
