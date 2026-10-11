import { useRef, useState } from "react";
import { PlusIcon } from "@heroicons/react/16/solid";
import { GameButton } from "@/components/game/Button";
import { registerLocalSaves } from "@/features/campaign/localSaves";
import { useEu5InsightPanelOpen } from "../store";
import { useHistory } from "../history/store";
import { ImportProgress } from "../history/ImportProgress";
import { CampaignSection } from "@/features/campaign/CampaignStepper";
import { PanelHeader } from "./PanelHeader";
import { MapModesSection } from "./MapModesSection";
import { RenderBar } from "./RenderBar";
import { ShareRow } from "./ShareSave";
import { ExportRow } from "./ExportRow";

export const Eu5ControlPanel = () => {
  const historyOpen = useHistory((state) => state.panelOpen);
  const insightOpen = useEu5InsightPanelOpen();
  const progress = useHistory((state) => state.progress);
  const cancel = useHistory((state) => state.cancel);
  return (
    <div className="pointer-events-auto absolute inset-y-0 left-0 z-30 w-[332px]">
      <aside className="flex h-full w-full flex-col border-r border-game-line-strong bg-game-panel">
        <PanelHeader />
        <CampaignSection className="border-b border-game-line" />
        <AddCampaignSaves />
        {progress && !(historyOpen && insightOpen) && (
          <div className="border-b border-game-line p-3">
            <ImportProgress progress={progress} onCancel={() => cancel?.()} />
          </div>
        )}
        <MapModesSection />
        <div className="flex-1 overflow-hidden" />
        <RenderBar />
        <ShareRow />
        <ExportRow />
      </aside>
    </div>
  );
};

function AddCampaignSaves() {
  const input = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const addFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((file) => /\.eu5$/i.test(file.name));
    if (!files.length) return;
    setBusy(true);
    try {
      useHistory.setState({ analysisPaused: false });
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
    <div className="flex items-center gap-2 border-b border-game-line px-3.5 py-2">
      <GameButton className="flex-1" disabled={busy} onClick={() => input.current?.click()}>
        <PlusIcon aria-hidden className="size-4" /> Add saves
      </GameButton>
      <GameButton variant="ghost" disabled={busy} onClick={() => folder.current?.click()}>
        Add folder
      </GameButton>
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
    </div>
  );
}
