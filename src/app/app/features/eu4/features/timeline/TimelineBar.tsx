import { CameraControl } from "./controls/CameraControl";
import { MapSettingsControl } from "./controls/MapSettingsControl";
import { TimelapseExport } from "./TimelapseExport";
import { TimelineReadout } from "@/features/timeline/TimelineReadout";
import { TimelineScrubber } from "@/features/timeline/TimelineScrubber";
import { TimelineTransport } from "@/features/timeline/TimelineTransport";
import { useTimelineKeyboard } from "@/features/timeline/controller";
import { useEu4MapMode, dateEnabledMapMode } from "../../store";
import { useTimelineController } from "./useTimelineController";

export function TimelineBar() {
  const controller = useTimelineController();
  const mapMode = useEu4MapMode();
  const timelineVisible = dateEnabledMapMode(mapMode);
  useTimelineKeyboard(timelineVisible ? controller : null);
  // The map settings and screenshots have no other home, so they stay when
  // the save has no history to scrub (its date is its start date).
  if (!timelineVisible || controller === null) {
    return (
      <div className="pointer-events-auto absolute bottom-4 left-4 z-20 flex items-center rounded-panel border border-game-line-strong bg-game-overlay p-1.5 text-game-ink-100 shadow-xl backdrop-blur-md">
        <MapSettingsControl />
        <CameraControl />
      </div>
    );
  }

  return (
    <div className="pointer-events-auto absolute right-[72px] bottom-4 left-4 z-20 font-game-ui">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-panel border border-game-line-strong bg-game-overlay py-2 pr-2 pl-2.5 text-game-ink-100 shadow-xl backdrop-blur-md">
        <TimelineTransport controller={controller} />
        <TimelineReadout controller={controller} className="shrink-0" />
        <div className="min-w-0 flex-1 basis-64">
          <TimelineScrubber controller={controller} />
        </div>
        <MapSettingsControl />
        <CameraControl />
        <TimelapseExport controller={controller} />
      </div>
    </div>
  );
}
