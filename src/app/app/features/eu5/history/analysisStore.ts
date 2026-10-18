import { analyticalBuffers } from "./transferBuffers";
import type { AnalysisDescriptor, MapFrame, SaveAnalysis } from "./analysisTypes";
import {
  countryAt,
  countryRow,
  marketAt,
  marketRow,
  validateTables,
  worldAt,
} from "./snapshotTables";
import type { CountryObservation, MarketObservation } from "./snapshotTables";

/** The error name when a save does not fit in the memory limit. */
export const MEMORY_LIMIT_ERROR = "AnalysisMemoryLimit";

/** One value for each snapshot that the query used. A missing value is null. */
export type HistoryRow<T> = {
  hash: string;
  date: string;
  dateSort: number;
  version: string;
  value: T | null;
};
export type HistoryResult<T> = {
  campaignId: string;
  /** The number of snapshots of the campaign when the query ran. */
  snapshots: number;
  rows: HistoryRow<T>[];
};

/** A country by its full ID (`UiCountryId`), or all countries. */
export type CountryEntity = { kind: "world" } | { kind: "country"; id: number };

const LOCATION_WIDTH = 7;
const POPULATION_METRIC = 1;

/** Own independent snapshot blocks; appending never copies previous observations. */
export class CampaignAnalysisStore {
  private bufferRefs = new Map<ArrayBuffer, number>();
  private residentBytes = 0;
  private saves = new Map<string, SaveAnalysis>();
  private layouts = new Map<string, Uint32Array<ArrayBuffer>>();
  private locationRows = new Map<string, Map<number, number>>();
  private strings = new Map<string, string>();
  private campaigns = new Map<string, AnalysisDescriptor[]>();

  constructor(private readonly limitBytes = Infinity) {}

  append(save: SaveAnalysis): AnalysisDescriptor {
    const row = save.observation;
    if (!row.hash || !row.campaignId || !Number.isInteger(row.dateSort))
      throw Error("Invalid map observation");
    const campaign = this.campaigns.get(row.campaignId) ?? [];
    const previous = campaign.find((item) => item.dateSort === row.dateSort);
    if (previous && previous.hash !== row.hash)
      throw Error(
        `A different save already occupies ${row.date}. Separate alternate campaign branches before importing.`,
      );
    const existing = this.saves.get(row.hash);
    if (existing) return existing.observation;
    const frame = save.projection,
      n = frame.locationIds.length;
    if (
      frame.layoutKey !== row.layoutKey ||
      frame.metrics.length !== n * LOCATION_WIDTH ||
      frame.fractions.length !== n * 2 ||
      [frame.owners, frame.controllers, frame.religions, frame.markets].some(
        (ids) => ids.length !== n,
      )
    )
      throw Error("Incomplete analytical map columns");
    validateTables(save.tables);
    const shared = this.layouts.get(frame.layoutKey);
    if (shared && (shared.length !== n || shared.some((id, i) => id !== frame.locationIds[i])))
      throw Error("Incompatible analytical map layout");

    const buffers = analyticalBuffers(save).filter((buffer) => {
      // A shared layout replaces the location IDs of this save.
      if (shared && buffer === frame.locationIds.buffer) return false;
      return !this.bufferRefs.has(buffer);
    });
    const added = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
    if (this.residentBytes + added > this.limitBytes) {
      const error = Error(
        `Campaign analysis is full. It keeps at most ${mib(this.limitBytes)} of snapshots in memory.`,
      );
      error.name = MEMORY_LIMIT_ERROR;
      throw error;
    }

    if (shared) frame.locationIds = shared;
    else this.layouts.set(frame.layoutKey, frame.locationIds);
    // Many snapshots have the same tags and goods. Keep one copy of each.
    save.tables.strings = save.tables.strings.map((value) => {
      const kept = this.strings.get(value);
      if (kept !== undefined) return kept;
      this.strings.set(value, value);
      return value;
    });
    for (const buffer of analyticalBuffers(save)) {
      const count = this.bufferRefs.get(buffer) ?? 0;
      if (!count) this.residentBytes += buffer.byteLength;
      this.bufferRefs.set(buffer, count + 1);
    }
    this.saves.set(row.hash, save);
    campaign.push(row);
    campaign.sort((a, b) => a.dateSort - b.dateSort || a.hash.localeCompare(b.hash));
    this.campaigns.set(row.campaignId, campaign);
    return row;
  }

  timeline(campaignId: string, layoutKey?: string): AnalysisDescriptor[] {
    return (this.campaigns.get(campaignId) ?? []).filter(
      (row) => !layoutKey || row.layoutKey === layoutKey,
    );
  }

  private require(hash: string): SaveAnalysis {
    const save = this.saves.get(hash);
    if (!save)
      throw Error("This observation is no longer available. Import the original saves again.");
    return save;
  }

  mapFrame(hash: string): MapFrame {
    const save = this.require(hash);
    return { ...save.projection, ...save.observation };
  }

  /** Run `read` on each snapshot of the campaign, in date order. */
  private history<T>(campaignId: string, read: (save: SaveAnalysis) => T | null): HistoryResult<T> {
    const timeline = this.timeline(campaignId);
    return {
      campaignId,
      snapshots: timeline.length,
      rows: timeline.map(({ hash, date, dateSort, version }) => ({
        hash,
        date,
        dateSort,
        version,
        value: read(this.require(hash)),
      })),
    };
  }

  /** A country by its full ID. A snapshot without that country is a gap. */
  countryHistory(campaignId: string, entity: CountryEntity): HistoryResult<CountryObservation> {
    return this.history(campaignId, ({ tables }) => {
      if (entity.kind === "world") return worldAt(tables);
      const row = countryRow(tables, entity.id);
      return row < 0 ? null : countryAt(tables, row);
    });
  }

  /**
   * The population of a fixed set of locations, by location ID. If a snapshot
   * does not have one of the locations, its total is a gap.
   */
  locationPopulation(campaignId: string, locationIds: readonly number[]): HistoryResult<number> {
    return this.history(campaignId, ({ projection }) => {
      if (!locationIds.length) return null;
      const rows = this.locationIndex(projection.layoutKey);
      let total = 0;
      for (const id of locationIds) {
        const row = rows.get(id);
        if (row === undefined) return null;
        total += projection.metrics[row * LOCATION_WIDTH + POPULATION_METRIC];
      }
      return total;
    });
  }

  private locationIndex(layoutKey: string) {
    let rows = this.locationRows.get(layoutKey);
    if (!rows) {
      rows = new Map();
      const ids = this.layouts.get(layoutKey) ?? [];
      for (let i = 0; i < ids.length; i++) rows.set(ids[i], i);
      this.locationRows.set(layoutKey, rows);
    }
    return rows;
  }

  /**
   * A good at the markets of center locations. Market IDs change between
   * saves, so the center identifies the series. A snapshot with no market at
   * a center is a gap for that center.
   */
  marketHistory(
    campaignId: string,
    good: string,
    centers: readonly number[],
  ): HistoryResult<(MarketObservation | null)[]> {
    return this.history(campaignId, ({ tables }) =>
      centers.map((center) => {
        const row = marketRow(tables, center, good);
        return row < 0 ? null : marketAt(tables, row);
      }),
    );
  }

  /** The goods and market centers in all snapshots of the campaign. */
  marketCatalog(campaignId: string) {
    const goods = new Set<string>();
    const centers = new Map<number, string | null>();
    for (const { hash } of this.timeline(campaignId)) {
      const { tables } = this.require(hash);
      const seen = new Set<number>();
      for (let row = 0; row < tables.marketCenters.length; row++) {
        goods.add(tables.strings[tables.marketGoods[row]]);
        const center = tables.marketCenters[row];
        if (seen.has(center)) continue;
        seen.add(center);
        // The latest name wins.
        const name = marketAt(tables, row).centerName;
        if (name || !centers.has(center)) centers.set(center, name);
      }
    }
    return {
      goods: [...goods].sort(),
      centers: [...centers].map(([center, name]) => ({ center, name })),
    };
  }

  /** The market centers where a country owned locations at some snapshot. */
  marketCenters(campaignId: string, countryId: number): number[] {
    const centers = new Set<number>();
    for (const { hash } of this.timeline(campaignId)) {
      const { tables } = this.require(hash);
      const row = countryRow(tables, countryId);
      if (row < 0) continue;
      const start = tables.countryMarketOffsets[row];
      const end = tables.countryMarketOffsets[row + 1];
      for (let i = start; i < end; i++) centers.add(tables.countryMarkets[i]);
    }
    return [...centers];
  }

  /** All country and market observations of a campaign, as JSON. */
  exportObservations(campaignId: string): Blob {
    const parts: BlobPart[] = ['{"snapshots":['];
    for (const [index, row] of this.timeline(campaignId).entries()) {
      const { tables } = this.require(row.hash);
      if (index) parts.push(",");
      // One string for each snapshot, so a large campaign does not make one huge string.
      parts.push(
        JSON.stringify(
          {
            hash: row.hash,
            campaignId: row.campaignId,
            date: row.date,
            version: row.version,
            fileName: row.fileName,
            countries: Array.from(tables.countryIds, (_, i) => countryAt(tables, i)),
            markets: Array.from(tables.marketCenters, (_, i) => marketAt(tables, i)),
          },
          (_key, value) => (value instanceof Map ? Object.fromEntries(value) : value),
        ),
      );
    }
    parts.push("]}");
    return new Blob(parts, { type: "application/json" });
  }

  clearCampaign(campaignId?: string) {
    for (const [hash, save] of this.saves) {
      if (campaignId && save.observation.campaignId !== campaignId) continue;
      for (const buffer of analyticalBuffers(save)) {
        const count = this.bufferRefs.get(buffer)! - 1;
        if (count) this.bufferRefs.set(buffer, count);
        else {
          this.bufferRefs.delete(buffer);
          this.residentBytes -= buffer.byteLength;
        }
      }
      this.saves.delete(hash);
    }
    if (campaignId) this.campaigns.delete(campaignId);
    else this.campaigns.clear();
    const used = new Set([...this.saves.values()].map((save) => save.projection.layoutKey));
    for (const key of this.layouts.keys()) {
      if (used.has(key)) continue;
      this.layouts.delete(key);
      this.locationRows.delete(key);
    }
    if (!this.saves.size) this.strings.clear();
  }

  memoryBytes() {
    return this.residentBytes;
  }

  memoryLimitBytes() {
    return this.limitBytes;
  }
}

const mib = (bytes: number) => `${Math.round(bytes / 1024 ** 2)} MiB`;

/**
 * A snapshot is about 2.3 MiB at 28,500 locations: 1.45 MiB of location
 * columns and up to 0.8 MiB of country and market tables. Use at most a
 * quarter of the device memory, so 1.5 GiB keeps about 650 snapshots.
 */
export function analysisMemoryLimit(deviceMemoryGiB = 4) {
  return Math.min(1536, Math.max(256, (deviceMemoryGiB * 1024) / 4)) * 1024 ** 2;
}
