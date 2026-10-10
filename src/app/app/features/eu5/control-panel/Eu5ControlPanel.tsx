import { GameButton } from "@/components/game/Button";
import { ClockIcon } from "@heroicons/react/24/outline";
import { useHistory } from "../history/store";
import { useSetEu5InsightPanelOpen } from "../store";
import { footRow, footLabel } from "./footRow";
import { PanelHeader } from "./PanelHeader";
import { MapModesSection } from "./MapModesSection";
import { RenderBar } from "./RenderBar";
import { ShareRow } from "./ShareSave";
import { ExportRow } from "./ExportRow";

export const Eu5ControlPanel = () => {
  const showHistory = useHistory((s) => s.showPanel);
  const setPanelOpen = useSetEu5InsightPanelOpen();
  return (
    <div className="pointer-events-auto absolute inset-y-0 left-0 z-30 w-[332px]">
      <aside className="flex h-full w-full flex-col border-r border-game-line-strong bg-game-panel">
        <PanelHeader />
        <MapModesSection />
        <div className="flex-1 overflow-hidden" />
        <div className={footRow}>
          <span className={footLabel}>History</span>
          <GameButton
            variant="ghost"
            onClick={() => {
              showHistory(true);
              setPanelOpen(true);
            }}
          >
            <ClockIcon className="h-4 w-4" /> Over time · add saves
          </GameButton>
        </div>
        <RenderBar />
        <ShareRow />
        <ExportRow />
      </aside>
    </div>
  );
};
