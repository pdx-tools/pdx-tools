import { ResidentStore } from "@/features/campaign/analysis/residentStore";
import type { PayloadAdapter } from "@/features/campaign/analysis/residentStore";
import { EU5_EXTRACTOR_VERSION } from "./analysisTypes";
import type { Eu5Payload, Eu5SnapshotDescriptor, MapFrame, SaveAnalysis } from "./analysisTypes";

import {
  snapshotView,
  snapshotCountry,
  snapshotMetadata,
  countryAt,
  marketAt,
  validateSnapshot,
} from "./packedSnapshot";
import { overview } from "./packedOverview";
import { exportSnapshots } from "./exportSnapshots";
import type { AnalysisEntity, HistoryQuery } from "./analysisTypes";
import type { Snapshot } from "./types";
import type { OverviewData } from "@/wasm/wasm_eu5";

const LOCATION_WIDTH = 7;

export const eu5PayloadAdapter: PayloadAdapter<Eu5SnapshotDescriptor, Eu5Payload> = {
  game: "eu5",
  extractorVersion: EU5_EXTRACTOR_VERSION,
  validate: (descriptor, { projection: frame, snapshot }) => {
    validateSnapshot(snapshot);
    if (
      snapshot.hash !== descriptor.id ||
      snapshot.campaignId !== descriptor.campaignId ||
      snapshot.dateSort !== descriptor.dateSort
    )
      throw Error("Analytical snapshot does not match descriptor");
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
    payload.worldSnapshot = this.world(payload.snapshot);
    return this.store.append(descriptor, payload);
  }
  timeline(campaignId: string) {
    return this.store.timeline(campaignId);
  }
  private require(id: string) {
    return this.store.read(id).payload;
  }

  mapFrame(id: string): MapFrame {
    const { descriptor, payload } = this.store.read(id);
    return { descriptor, projection: payload.projection };
  }
  queryOverview<K extends keyof OverviewData>(
    hash: string,
    key: K,
  ): { hash: string; data: OverviewData[K] } {
    return { hash, data: overview(this.require(hash).overviews, key) };
  }
  queryHistory(query: HistoryQuery): Snapshot[] {
    return this.timeline(query.campaignId).map((row) => {
      const source = this.require(row.id).snapshot;
      const country =
        query.country && query.country !== "world"
          ? snapshotCountry(source, query.country)
          : this.require(row.id).worldSnapshot;
      const packed = this.require(row.id).snapshot,
        markets: Snapshot["markets"] = [];
      const good = query.good ? packed.strings.indexOf(query.good) : -1;
      if (good >= 0)
        for (let i = 0; i < packed.marketIds.length; i += 2) {
          if (packed.marketIds[i + 1] !== good) continue;
          const center = packed.marketMetadata[packed.marketIds[i] * 3 + 1];
          if (!query.centers?.length || query.centers.includes(center))
            markets.push(marketAt(source, i / 2));
        }
      const metadata = snapshotMetadata(source);
      return { ...metadata, marketLabels: {}, countries: country ? [{ ...country }] : [], markets };
    });
  }
  private world(source: Eu5Payload["snapshot"]): Snapshot["countries"][number] | undefined {
    const countries = Array.from({ length: source.countryIds.length / 3 }, (_, i) =>
      countryAt(source, i),
    );
    const first = countries[0];
    if (!first) return undefined;
    const total = {
      ...first,
      countryId: 0xffffffff,
      tag: "world",
      greatPowerRank: undefined,
      religions: new Map<string, number>(),
      materials: new Map<string, number>(),
      buildings: new Map<string, number>(),
      marketCenters: [],
    };
    for (const key of Object.keys(first) as (keyof typeof first)[]) {
      if (typeof first[key] === "number" && key !== "greatPowerRank" && key !== "countryId")
        (total as unknown as Record<string, unknown>)[key] = countries.reduce(
          (sum, c) => sum + Number(c[key]),
          0,
        );
    }
    for (const c of countries)
      for (const key of ["religions", "materials", "buildings"] as const)
        for (const [name, value] of c[key])
          total[key].set(name, (total[key].get(name) ?? 0) + value);
    return total;
  }
  marketCenters(campaignId: string, country: string): number[] {
    const centers = new Set<number>();
    for (const row of this.timeline(campaignId)) {
      const snapshot = this.require(row.id).snapshot;
      for (const center of snapshotCountry(snapshot, country)?.marketCenters ?? [])
        centers.add(center);
    }
    return [...centers];
  }
  resolveEntity(hash: string, entity: AnalysisEntity): AnalysisEntity {
    const save = this.require(hash);
    if (entity.kind === "country") {
      const id = save.countryIds[entity.id];
      if (entity.id === 0 || id === undefined)
        throw Error("Country is not present in this observation");
      return { ...entity, id };
    }
    if (entity.kind === "location") {
      const id = save.projection.locationIds[entity.id];
      if (id === undefined) throw Error("Location is not present in this observation");
      return { ...entity, id };
    }
    return entity;
  }
  exportObservations(campaignId: string): Blob {
    return exportSnapshots(
      this.timeline(campaignId).map((row) => snapshotView(this.require(row.id).snapshot)),
    );
  }
}
