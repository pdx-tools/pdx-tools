import { ResidentStore } from "@/features/campaign/analysis/residentStore";
import type { PayloadAdapter } from "@/features/campaign/analysis/residentStore";
import { EU5_EXTRACTOR_VERSION } from "./analysisTypes";
import type { Eu5Payload, Eu5SnapshotDescriptor, MapFrame, SaveAnalysis } from "./analysisTypes";

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

/** The EU5 snapshots of one resident session. */
export class Eu5CampaignAnalysis {
  readonly store: ResidentStore<Eu5SnapshotDescriptor, Eu5Payload>;

  constructor(limitBytes = Infinity) {
    this.store = new ResidentStore(eu5PayloadAdapter, limitBytes);
  }

  append({ descriptor, payload }: SaveAnalysis) {
    return this.store.append(descriptor, payload);
  }

  mapFrame(id: string): MapFrame {
    const { descriptor, payload } = this.store.read(id);
    return { descriptor, projection: payload.projection };
  }
}
