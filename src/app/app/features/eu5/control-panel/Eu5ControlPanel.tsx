import { useMapHistory } from "../history/context";
import { useIsCampaignAnalysisEnabled } from "../history/useIsCampaignAnalysisEnabled";
import { GameButton } from "@/components/game/Button";
import { localSaveRegistry } from "@/features/campaign/localSaves";
import { useEu5PlaythroughId } from "../store";
import { isAnalysisPaused, useHistory } from "../history/store";
import { ImportProgress } from "../history/ImportProgress";
import { analyzeCampaign } from "../history/analyzeCampaign";
import { CampaignSection } from "@/features/campaign/CampaignStepper";
import { PanelHeader } from "./PanelHeader";
import { MapModesSection } from "./MapModesSection";
import { RenderBar } from "./RenderBar";
import { ShareRow } from "./ShareSave";
import { ExportRow } from "./ExportRow";

export const Eu5ControlPanel = () => {
  const preview = useMapHistory()?.preview;
  return (
    <div className="pointer-events-auto absolute inset-y-0 left-0 z-30 w-[332px]">
      <aside className="flex h-full w-full flex-col border-r border-game-line-strong bg-game-panel">
        <PanelHeader />
        <CampaignSection className="border-b border-game-line" />
        <CampaignAnalysisControls />
        <MapModesSection />
        <div className="flex-1 overflow-hidden" />
        <RenderBar />
        <ShareRow unavailable={!!preview} />
        <ExportRow />
      </aside>
    </div>
  );
};

function CampaignAnalysisControls() {
  const featureEnabled = useIsCampaignAnalysisEnabled();
  const playthroughId = useEu5PlaythroughId();
  const localSaves = localSaveRegistry.useEntries();
  const progress = useHistory((state) => state.progress);
  const cancel = useHistory((state) => state.cancel);
  const paused = useHistory((state) => isAnalysisPaused(state, playthroughId));
  const issues = useHistory((state) => state.issues);
  const memoryFull = useHistory((state) => state.memoryFull);
  const enabled = useHistory(
    (state) => !!playthroughId && state.analysisEnabledCampaigns.includes(playthroughId),
  );
  if (!featureEnabled) return null;
  const entries = localSaves.filter(
    (entry) =>
      entry.game === "eu5" && (!entry.identity || entry.identity.playthroughId === playthroughId),
  );
  return (
    <div className="border-b border-game-line px-3.5 py-2">
      {(!enabled || paused || issues.length > 0) && (
        <GameButton
          disabled={!!progress || !playthroughId || !entries.length}
          onClick={() => {
            if (!playthroughId) return;
            useHistory.getState().enableAnalysis(playthroughId);
            if (enabled)
              void analyzeCampaign(entries, playthroughId).catch((error) =>
                useHistory.setState({ issues: [String(error)] }),
              );
          }}
        >
          {!enabled ? "Analyze campaign" : paused ? "Resume analysis" : "Retry analysis"}
        </GameButton>
      )}
      {progress && <ImportProgress progress={progress} onCancel={() => cancel?.()} />}
      {memoryFull && (
        <p role="status" className="mt-2 text-xs text-game-ink-300">
          {memoryFull}
        </p>
      )}
      {issues.length > 0 && (
        <details className="mt-2 text-xs text-game-ink-300">
          <summary>{issues.length} analysis notices</summary>
          <ul className="max-h-32 overflow-y-auto break-words">
            {issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
