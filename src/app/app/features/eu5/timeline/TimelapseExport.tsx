import { TimelapseExport as TimelapseExportPanel } from "@/features/timeline/TimelapseExport";
import type { TimelineController } from "@/features/timeline/controller";
import { savedDatePlan } from "@pdx.tools/timelapse";
import type { TimelapseOptions } from "@pdx.tools/timelapse";
import {
  useEu5Engine,
  useEu5MapMode,
  useEu5MapViewport,
  useEu5PlaythroughName,
  useEu5Timelapse,
} from "../store";
import type { MapHistoryValue } from "../history/MapHistory";
import type { WorldSilhouette } from "@/features/timeline/worldSilhouette";

/** The EU5 map is the whole 2:1 grid. */
const WORLD: WorldSilhouette = { aspect: 2, window: { top: 0, bottom: 180 } };

/** The export panel on the EU5 engine. */
export function TimelapseExport({ controller }: { controller: TimelineController }) {
  const engine = useEu5Engine();
  const timelapse = useEu5Timelapse();
  const playthroughName = useEu5PlaythroughName();
  // The view thumbnail follows the map: the worker reports where it is
  // looking on the frames that change, so a zoom under the open panel
  // tightens the frame as it happens.
  const mapViewport = useEu5MapViewport();
  const { start, end } = controller.timeline;

  return (
    <TimelapseExportPanel
      controller={controller}
      timelapse={timelapse}
      mapViewport={mapViewport}
      fileName={`${playthroughName}-timelapse-${start.year}-${end.year}`}
      world={WORLD}
      record={engine.trigger.recordTimelapse}
      stop={engine.trigger.stopTimelapse}
    />
  );
}

/**
 * The export panel on saved-date playback. The film shows each saved date
 * as a still, in the map mode of the playback.
 */
export function SavedDateExport({
  controller,
  history,
}: {
  controller: TimelineController;
  history: MapHistoryValue;
}) {
  const timelapse = useEu5Timelapse();
  const playthroughName = useEu5PlaythroughName();
  const engine = useEu5Engine();
  const mapViewport = useEu5MapViewport();
  const mapMode = useEu5MapMode();
  const { start, end } = controller.timeline;
  const dates = history.frames;
  // The film shows one map mode, so the file has its name: `rgoLevel` is `rgo-level`.
  const modeName = mapMode.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  const plan = (options: TimelapseOptions) => {
    const { seconds, bytes } = savedDatePlan({ dates, options });
    return { span: `${dates} ${dates === 1 ? "saved date" : "saved dates"}`, seconds, bytes };
  };

  return (
    <TimelapseExportPanel
      controller={controller}
      timelapse={timelapse}
      mapViewport={mapViewport}
      fileName={`${playthroughName}-${modeName}-${start.year}-${end.year}`}
      plan={plan}
      world={WORLD}
      record={history.record}
      stop={engine.trigger.stopTimelapse}
    />
  );
}
