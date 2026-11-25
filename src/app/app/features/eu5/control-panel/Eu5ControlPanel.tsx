import { useMapHistory } from "../history/context";
import { AddCampaignSaves } from "./AddCampaignSaves";
import { CampaignSection } from "@/features/campaign/CampaignStepper";
import { WatchControl } from "@/features/keptSaves/WatchControl";
import { PanelHeader } from "./PanelHeader";
import { MapModesSection } from "./MapModesSection";
import { RenderBar } from "./RenderBar";
import { ShareRow } from "./ShareSave";
import { ExportRow } from "./ExportRow";

/** While a save loads, only the way back to the open save takes input. */
export const Eu5ControlPanel = ({ inert }: { inert: boolean }) => {
  const preview = useMapHistory()?.preview;
  return (
    <div className="pointer-events-auto absolute inset-y-0 left-0 z-30 w-[332px]">
      <aside className="flex h-full w-full flex-col border-r border-game-line-strong bg-game-panel">
        <div inert={inert}>
          <PanelHeader />
        </div>
        <div className="hidden flex-col gap-2 border-b border-game-line px-3.5 py-3 has-[section,[role=group]]:flex">
          <div className="contents" inert={inert}>
            <CampaignSection className="p-0!" />
          </div>
          <WatchControl />
        </div>
        <div className="contents" inert={inert}>
          <AddCampaignSaves />
          <MapModesSection />
          <div className="flex-1 overflow-hidden" />
          <RenderBar />
          <ShareRow unavailable={!!preview} />
          <ExportRow />
        </div>
      </aside>
    </div>
  );
};
