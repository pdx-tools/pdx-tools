import { useRef, useState } from "react";
import PlusIcon from "@heroicons/react/16/solid/PlusIcon";
import { useIsCampaignAnalysisEnabled } from "../history/useIsCampaignAnalysisEnabled";
import { GameButton } from "@/components/game/Button";
import { holdsRef, localSaveRegistry, registerLocalSaves } from "@/features/campaign/localSaves";
import { useEu5Input, useEu5PlaythroughId } from "../store";
import { isAnalysisPaused, useHistory } from "../history/store";
import { ImportProgress } from "../history/ImportProgress";
import { analyzeCampaign } from "../history/analyzeCampaign";

export function AddCampaignSaves() {
  const featureEnabled = useIsCampaignAnalysisEnabled();
  const input = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const playthroughId = useEu5PlaythroughId();
  const currentInput = useEu5Input();
  const localSaves = localSaveRegistry.useEntries();
  const progress = useHistory((state) => state.progress);
  const cancel = useHistory((state) => state.cancel);
  const paused = useHistory((state) => isAnalysisPaused(state, playthroughId));
  const issues = useHistory((state) => state.issues);
  const enabled = useHistory(
    (state) => !!playthroughId && state.analysisEnabledCampaigns.includes(playthroughId),
  );
  const entries = localSaves.filter(
    (entry) =>
      entry.game === "eu5" &&
      (entry.identity === null ||
        entry.identity.playthroughId === playthroughId ||
        (currentInput.kind !== "server" && holdsRef(entry, currentInput))),
  );
  const addFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((file) => /\.eu5$/i.test(file.name));
    if (!files.length) return;
    setBusy(true);
    try {
      await registerLocalSaves(
        "eu5",
        files.map((file) => ({ kind: "file", file })),
      );
    } catch (error) {
      useHistory.setState({ issues: [String(error)] });
    } finally {
      setBusy(false);
    }
  };
  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    void addFiles(event.currentTarget.files);
    event.currentTarget.value = "";
  };
  return (
    <div className="border-b border-game-line px-3.5 py-2">
      <div className="flex items-center gap-2">
        <GameButton className="flex-1" disabled={busy} onClick={() => input.current?.click()}>
          <PlusIcon aria-hidden className="size-4" /> Add saves
        </GameButton>
        <GameButton variant="ghost" disabled={busy} onClick={() => folder.current?.click()}>
          Add folder
        </GameButton>
      </div>
      <input
        ref={input}
        type="file"
        aria-label="Add campaign saves"
        className="sr-only"
        accept=".eu5"
        multiple
        onChange={onChange}
      />
      <input
        ref={folder}
        type="file"
        aria-label="Add campaign save folder"
        className="sr-only"
        multiple
        {...{ webkitdirectory: "" }}
        onChange={onChange}
      />
      {featureEnabled && (!enabled || paused || issues.length > 0) && (
        <GameButton
          className="mt-2 w-full"
          variant="ghost"
          disabled={busy || !!progress || !entries.length || !playthroughId}
          onClick={() => {
            if (!playthroughId) return;
            useHistory.getState().enableAnalysis(playthroughId);
            if (enabled)
              void analyzeCampaign(entries, playthroughId).catch((error) =>
                useHistory.setState({ issues: [String(error)] }),
              );
          }}
        >
          {progress
            ? "Analyzing saves…"
            : !enabled
              ? "Analyze campaign"
              : paused
                ? "Resume import"
                : "Retry import"}
        </GameButton>
      )}
      {progress && (
        <div className="mt-3">
          <ImportProgress progress={progress} onCancel={() => cancel?.()} />
        </div>
      )}
      {issues.length > 0 && (
        <details className="mt-2 text-xs text-game-ink-300">
          <summary className="cursor-pointer">{issues.length} import notices</summary>
          <ul className="mt-2 max-h-32 space-y-2 overflow-y-auto break-words">
            {issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
