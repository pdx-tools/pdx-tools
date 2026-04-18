import { PanelHeader } from "./PanelHeader";
import { MapModesSection } from "./MapModesSection";
import { RenderBar } from "./RenderBar";
import { ActionsRail } from "./ActionsRail";

export const Eu5ControlPanel = () => {
  return (
    <div className="pointer-events-auto absolute inset-y-0 left-0 z-30 w-[332px]">
      <aside className="flex h-full w-full flex-col border-r border-eu5-line-strong bg-eu5-bg-panel/95 backdrop-blur-md">
        <PanelHeader />
        <MapModesSection />
        <div className="flex-1 overflow-hidden" />
        <RenderBar />
        <ActionsRail />
      </aside>
    </div>
  );
};
