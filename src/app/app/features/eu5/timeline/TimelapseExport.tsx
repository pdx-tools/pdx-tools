import { TimelapseExport as TimelapseExportPanel } from "@/features/timeline/TimelapseExport";
import type { TimelineController } from "@/features/timeline/controller";
import { useEu5Engine, useEu5MapViewport, useEu5PlaythroughName, useEu5Timelapse } from "../store";
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
