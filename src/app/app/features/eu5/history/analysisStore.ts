import type { PayloadAdapter, ResidentStore } from "@/features/campaign/analysis/residentStore";
import { EU5_EXTRACTOR_VERSION } from "./analysisTypes";
import type { Eu5Payload, Eu5SnapshotDescriptor, MapFrame } from "./analysisTypes";

const LOCATION_WIDTH = 7;

export const eu5PayloadAdapter: PayloadAdapter<Eu5SnapshotDescriptor, Eu5Payload> = {
  game: "eu5",
  extractorVersion: EU5_EXTRACTOR_VERSION,
  validate: (descriptor, { projection: frame }) => {
    const n = frame.locationIds.length;
    if (
      frame.layoutKey !== descriptor.layoutKey ||
      frame.metrics.length !== n * LOCATION_WIDTH ||
      frame.fractions.length !== n * 2 ||
      [frame.owners, frame.controllers, frame.religions, frame.markets].some(
        (ids) => ids.length !== n,
      )
    )
      throw Error("Incomplete analytical map columns");
  },
  layouts: ({ projection }) => [{ key: projection.layoutKey, ids: projection.locationIds }],
  useLayout: ({ projection }, _key, ids) => {
    projection.locationIds = ids;
  },
};

/** The map columns that a game worker paints for a snapshot. */
export function mapFrame(store: ResidentStore<Eu5SnapshotDescriptor, Eu5Payload>, id: string) {
  const { descriptor, payload } = store.read(id);
  return { descriptor, projection: payload.projection } satisfies MapFrame;
}
