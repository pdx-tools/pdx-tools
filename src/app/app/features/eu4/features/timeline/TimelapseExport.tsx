import { useCallback, useState } from "react";
import { IMG_HEIGHT, IMG_WIDTH } from "@pdx.tools/map";
import type { MapViewport } from "@pdx.tools/timelapse";
import { TimelapseExport as TimelapseExportPanel } from "@/features/timeline/TimelapseExport";
import type { TimelineController } from "@/features/timeline/controller";
import { useEu4Actions, useEu4Map, useEu4Timelapse, useSaveFilenameWith } from "../../store";
import type { WorldSilhouette } from "@/features/timeline/worldSilhouette";

/**
 * The EU4 map drops the polar caps: 2.75:1, with land against both edges.
 * The window is the rows of the outline that hold every coast EU4 shows,
 * from Siberia's to Tierra del Fuego's. EU4's projection is not a plain
 * stretch of that: it puts the Mediterranean a few units lower and the
 * Pacific coasts a few units east, which an abstract thumbnail accepts
 * over a window that cuts a continent.
 */
const WORLD: WorldSilhouette = {
  aspect: IMG_WIDTH / IMG_HEIGHT,
  window: { top: 12, bottom: 146 },
};

/** The export panel on the EU4 store. */
export function TimelapseExport({ controller }: { controller: TimelineController }) {
  const actions = useEu4Actions();
  const map = useEu4Map();
  const timelapse = useEu4Timelapse();
  const fileName = useSaveFilenameWith("-timelapse");

  // The EU4 map worker does not report its viewport as it moves, so the
  // view thumbnail is read each time the panel opens.
  const [mapViewport, setMapViewport] = useState<MapViewport | null>(null);
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (open) map.getViewport().then(setMapViewport);
    },
    [map],
  );

  return (
    <TimelapseExportPanel
      controller={controller}
      timelapse={timelapse}
      mapViewport={mapViewport}
      onOpenChange={onOpenChange}
      fileName={fileName}
      world={WORLD}
      record={actions.recordTimelapse}
      stop={actions.stopTimelapse}
    />
  );
}
