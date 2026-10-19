import { MapColumnStore } from "./mapColumnStore";
import {
  snapshotView,
  snapshotCountry,
  snapshotGoods,
  snapshotMetadata,
  countryAt,
  marketAt,
  validateSnapshot,
} from "./packedSnapshot";
import { overview } from "./packedOverview";
import { exportSnapshots } from "./exportSnapshots";
import type {
  AnalysisDescriptor,
  AnalysisEntity,
  HistoryQuery,
  MapFrame,
  SaveAnalysis,
} from "./analysisTypes";
import type { Snapshot } from "./types";
import type { OverviewData } from "@/wasm/wasm_eu5";

type StoredAnalysis = Omit<SaveAnalysis, "observation"> & {
  observation: AnalysisDescriptor;
  worldSnapshot: Snapshot["countries"][number] | undefined;
};

/** Lives in one worker. The UI never retains the campaign's raw analytical columns. */
export class CampaignAnalysisStore extends MapColumnStore<StoredAnalysis> {
  private strings = new Map<string, string>();
  override append(save: SaveAnalysis): AnalysisDescriptor {
    const snapshot = save.snapshot;

    if (!snapshot.hash || !snapshot.campaignId) throw Error("Invalid analytical observation");
    validateSnapshot(snapshot);
    const existing = this.saves.get(snapshot.hash);
    if (existing) return existing.observation;
    const descriptor = this.describe(save);
    const worldSnapshot = this.world(snapshot);
    const intern = (label: string) => {
      const shared = this.strings.get(label);
      if (shared !== undefined) return shared;
      this.strings.set(label, label);
      return label;
    };
    snapshot.strings = snapshot.strings.map(intern);
    save.overviews.strings = save.overviews.strings.map(intern);
    for (const [id, name] of Object.entries(save.countryNames))
      save.countryNames[id] = intern(name);
    return super.append({ ...save, observation: descriptor, worldSnapshot });
  }
  private describe(save: SaveAnalysis): AnalysisDescriptor {
    const metadata = snapshotMetadata(save.snapshot);
    return {
      ...metadata,
      world: save.observation.world,
      layoutKey: save.projection.layoutKey,
      countryNames: save.countryNames,
      goods: snapshotGoods(save.snapshot),
    };
  }
  private require(hash: string): StoredAnalysis {
    const save = this.saves.get(hash);
    if (!save)
      throw Error("This observation is no longer available. Import the original saves again.");
    return save;
  }
  override mapFrame(hash: string): MapFrame {
    const save = this.require(hash);
    const { campaignId, date, dateSort, version, layoutKey, fileName, world } = save.observation;
    return {
      ...save.projection,
      hash,
      campaignId,
      date,
      dateSort,
      version,
      layoutKey,
      fileName,
      world,
    };
  }

  queryOverview<K extends keyof OverviewData>(
    hash: string,
    key: K,
  ): { hash: string; data: OverviewData[K] } {
    return { hash, data: overview(this.require(hash).overviews, key) };
  }
  queryHistory(query: HistoryQuery): Snapshot[] {
    return this.timeline(query.campaignId).map((row) => {
      const source = this.require(row.hash).snapshot;
      const country =
        query.country && query.country !== "world"
          ? snapshotCountry(source, query.country)
          : this.require(row.hash).worldSnapshot;
      const packed = this.require(row.hash).snapshot,
        markets: Snapshot["markets"] = [];
      const good = query.good ? packed.strings.indexOf(query.good) : -1;
      if (good >= 0)
        for (let i = 0; i < packed.marketIds.length; i += 2) {
          if (packed.marketIds[i + 1] !== good) continue;
          const center = packed.marketMetadata[packed.marketIds[i] * 3 + 1];
          if (!query.centers?.length || query.centers.includes(center))
            markets.push(marketAt(source, i / 2));
        }
      const {
        layoutKey: _layout,
        countryNames: _names,
        goods: _goods,
        marketLabels: _labels,
        ...metadata
      } = row;
      return { ...metadata, marketLabels: {}, countries: country ? [{ ...country }] : [], markets };
    });
  }
  private world(source: SaveAnalysis["snapshot"]): Snapshot["countries"][number] | undefined {
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
      const snapshot = this.require(row.hash).snapshot;
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
      this.timeline(campaignId).map((row) => snapshotView(this.require(row.hash).snapshot)),
    );
  }
  override clearCampaign(campaignId?: string): void {
    super.clearCampaign(campaignId);
    if (!this.saves.size) this.strings.clear();
  }
}
