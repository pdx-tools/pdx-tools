import { useEffect, useRef } from "react";
import { getLocalSave, useLocalSaves } from "@/features/campaign/localSaves";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import { useEu5PlaythroughId } from "../store";
import { analyzeCampaign } from "./analyzeCampaign";
import { useHistory } from "./store";

const sourceKey = (entry: LocalSaveEntry) => {
  const version = entry.version ?? (entry.ref.kind === "file" ? entry.ref.file : null);
  return `${entry.id}:${version?.size}:${version?.lastModified}`;
};

/** Analyze newly selected files in the background while campaign navigation stays available. */
export function CampaignAnalysis() {
  const entries = useLocalSaves();
  const playthroughId = useEu5PlaythroughId();
  const paused = useHistory((state) => state.analysisPaused);
  const progress = useHistory((state) => state.progress);
  const attempted = useRef(new Set<string>());
  useEffect(() => {
    if (!playthroughId || progress || paused) return;
    const pending = entries
      .filter(
        (entry) =>
          entry.game === "eu5" &&
          (!entry.identity || entry.identity.playthroughId === playthroughId) &&
          !attempted.current.has(sourceKey(entry)),
      )
      .slice(0, 1000);
    if (!pending.length) return;
    for (const entry of pending) attempted.current.add(sourceKey(entry));
    void analyzeCampaign(pending, playthroughId)
      .catch((error) => {
        useHistory.setState({ issues: [String(error)] });
      })
      .finally(() => {
        // Identity reads may finish during analysis. Don't immediately retry failed files.
        for (const entry of pending) {
          const current = getLocalSave(entry.id);
          if (current) attempted.current.add(sourceKey(current));
        }
      });
  }, [entries, playthroughId, progress, paused]);
  return null;
}
