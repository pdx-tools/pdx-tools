import { useEffectEvent, useLayoutEffect, useState } from "react";
import { CameraControl } from "./controls/CameraControl";
import { MapSettingsControl } from "./controls/MapSettingsControl";
import { TimelapseExport } from "./TimelapseExport";
import { TimelineReadout } from "@/features/timeline/TimelineReadout";
import { TimelineScrubber } from "@/features/timeline/TimelineScrubber";
import { TimelineTransport } from "@/features/timeline/TimelineTransport";
import { useTimelineKeyboard } from "@/features/timeline/controller";
import { useEu4MapMode, dateEnabledMapMode } from "../../store";
import { useTimelineController } from "./useTimelineController";
import { CampaignStepper } from "@/features/campaign/CampaignStepper";
import { useTimelineCampaign } from "@/features/campaign/SaveMarks";

/** The space between the bar and the controls above it, in px. */
const CLEARANCE_GAP = 8;

/**
 * Report the height from the bottom of the map to the top of the bar, and
 * a gap. The bar gets taller with the save lane of a campaign and when its
 * controls wrap.
 */
function useClearance(onClearance: (px: number) => void) {
  const report = useEffectEvent(onClearance);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const parent = el?.offsetParent;
    if (!el || !(parent instanceof HTMLElement)) return;
    const measure = () => report(parent.clientHeight - el.offsetTop + CLEARANCE_GAP);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [el]);
  return setEl;
}

export function TimelineBar({ onClearance }: { onClearance: (px: number) => void }) {
  const barRef = useClearance(onClearance);
  const controller = useTimelineController();
  const campaign = useTimelineCampaign(controller?.timeline.start);
  const mapMode = useEu4MapMode();
  const timelineVisible = dateEnabledMapMode(mapMode);
  useTimelineKeyboard(timelineVisible ? controller : null);
  // The map settings, screenshots, and campaign steps have no other home.
  // Thus they stay when the save has no history to scrub (its date is its
  // start date).
  if (!timelineVisible || controller === null) {
    return (
      <div
        ref={barRef}
        className="pointer-events-auto absolute bottom-4 left-4 z-20 flex items-center gap-1 rounded-panel border border-game-line-strong bg-game-overlay p-1.5 text-game-ink-100 shadow-xl backdrop-blur-md"
      >
        <CampaignStepper />
        <MapSettingsControl />
        <CameraControl />
      </div>
    );
  }

  return (
    <div
      ref={barRef}
      className="pointer-events-auto absolute right-[72px] bottom-4 left-4 z-20 font-game-ui"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-panel border border-game-line-strong bg-game-overlay py-2 pr-2 pl-2.5 text-game-ink-100 shadow-xl backdrop-blur-md">
        <TimelineTransport controller={controller} />
        <TimelineReadout controller={controller} className="shrink-0" />
        <div className="min-w-0 flex-1 basis-64">
          <TimelineScrubber controller={controller} campaign={campaign} />
        </div>
        <CampaignStepper />
        <MapSettingsControl />
        <CameraControl />
        <TimelapseExport controller={controller} />
      </div>
    </div>
  );
}
