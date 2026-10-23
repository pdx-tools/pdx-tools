import { useRef, useState } from "react";
import { useFilePublisher } from "@/features/engine";
import type { FileKind } from "@/hooks/useFileDrop";
import { isAbortError } from "@/lib/abortController";
import PlusIcon from "@heroicons/react/16/solid/PlusIcon";
import { useIsCampaignAnalysisEnabled } from "../history/useIsCampaignAnalysisEnabled";
import { saveProblemText } from "@/features/campaign/saveText";
import { GameButton } from "@/components/game/Button";
import { holdsRef, localSaveRegistry } from "@/features/campaign/localSaves";
import { useEu5Input, useEu5PlaythroughId } from "../store";
import { isAnalysisPaused, useHistory } from "../history/store";
import { ImportProgress } from "../history/ImportProgress";
import { analyzeCampaign } from "../history/analyzeCampaign";
import { pendingCampaignAnalysis } from "../history/CampaignAnalysis";

export function AddCampaignSaves() {
  const publishFile = useFilePublisher({ openSave: false });
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
  const undatedFailures = localSaves.filter(
    (entry) => entry.game === "eu5" && entry.identity === null && entry.problem !== null,
  );
  const addFiles = async (files: FileKind[]) => {
    const saves = files.filter((input) => /\.eu5$/i.test(input.file.name));
    if (!saves.length) return;
    setBusy(true);
    try {
      await publishFile(saves);
    } catch (error) {
      useHistory.setState({ issues: [String(error)] });
    } finally {
      setBusy(false);
    }
  };
  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    void addFiles(Array.from(event.currentTarget.files ?? [], (file) => ({ kind: "file", file })));
    event.currentTarget.value = "";
  };
  const chooseFiles = async () => {
    if (!("showOpenFilePicker" in window)) {
      input.current?.click();
      return;
    }
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        types: [{ description: "EU5 saves", accept: { "application/pdx": [".eu5"] } }],
      });
      await addFiles(handles.map((file) => ({ kind: "handle", file })));
    } catch (error) {
      if (!isAbortError(error)) useHistory.setState({ issues: [String(error)] });
    }
  };
  const chooseFolder = async () => {
    if (!("showDirectoryPicker" in window)) {
      folder.current?.click();
      return;
    }
    try {
      const directory = await window.showDirectoryPicker({ mode: "read" });
      setBusy(true);
      await addFiles(await folderSaves(directory));
    } catch (error) {
      if (!isAbortError(error)) useHistory.setState({ issues: [String(error)] });
    } finally {
      setBusy(false);
    }
  };
  if (!featureEnabled) return null;
  return (
    <div className="border-b border-game-line px-3.5 py-2">
      <div className="flex items-center gap-2">
        <GameButton className="flex-1" disabled={busy} onClick={chooseFiles}>
          <PlusIcon aria-hidden className="size-4" /> Add saves
        </GameButton>
        <GameButton variant="ghost" disabled={busy} onClick={chooseFolder}>
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
      {(!enabled || paused || issues.length > 0) && (
        <GameButton
          className="mt-2 w-full"
          variant="ghost"
          disabled={busy || !!progress || !entries.length || !playthroughId}
          onClick={() => {
            if (!playthroughId) return;
            useHistory.getState().enableAnalysis(playthroughId);
            if (!enabled) return;
            // A retry ignores earlier attempts, but analyzed saves stay.
            const pending = pendingCampaignAnalysis(entries, playthroughId, new Set());
            if (pending.length)
              void analyzeCampaign(pending, playthroughId).catch((error) =>
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
      {undatedFailures.length > 0 && (
        <details className="mt-2 text-xs text-game-err">
          <summary className="cursor-pointer">
            {undatedFailures.length} failed {undatedFailures.length === 1 ? "save" : "saves"}{" "}
            without readable dates
          </summary>
          <ul className="mt-2 space-y-2 break-words">
            {undatedFailures.map((entry) => (
              <li key={entry.id}>
                {entry.name}: {saveProblemText(entry.problem!)}
              </li>
            ))}
          </ul>
        </details>
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

/** Keep file handles when selecting a folder, including nested save directories. */
async function folderSaves(directory: FileSystemDirectoryHandle): Promise<FileKind[]> {
  const files: FileKind[] = [];
  for await (const handle of directory.values()) {
    if (handle.kind === "directory") files.push(...(await folderSaves(handle)));
    else if (/\.eu5$/i.test(handle.name)) files.push({ kind: "handle", file: handle });
  }
  return files;
}
