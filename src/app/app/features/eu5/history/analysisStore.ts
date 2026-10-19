import { ResidentStore } from "@/features/campaign/analysis/residentStore";
import type { PayloadAdapter } from "@/features/campaign/analysis/residentStore";
import { EU5_EXTRACTOR_VERSION } from "./analysisTypes";
import type { Eu5Payload, Eu5SnapshotDescriptor, MapFrame, SaveAnalysis } from "./analysisTypes";
import {
  countryAt,
  countryRow,
  marketAt,
  marketRow,
  validateTables,
  worldAt,
} from "./snapshotTables";
import type { CountryObservation, MarketObservation } from "./snapshotTables";

/** One value for each snapshot that the query used. A missing value is null. */
export type HistoryRow<T> = {
  id: string;
  contentHash: string;
  date: string;
  dateSort: number;
  gameVersion: string;
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

export const eu5PayloadAdapter: PayloadAdapter<Eu5SnapshotDescriptor, Eu5Payload> = {
  game: "eu5",
  extractorVersion: EU5_EXTRACTOR_VERSION,
  validate: (descriptor, { projection: frame, tables }) => {
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
    validateTables(tables);
  },
  layouts: ({ projection }) => [{ key: projection.layoutKey, ids: projection.locationIds }],
  useLayout: ({ projection }, _key, ids) => {
    projection.locationIds = ids;
  },
  // Many snapshots have the same tags and goods.
  internStrings: ({ tables }, intern) => {
    tables.strings = tables.strings.map(intern);
  },
};

/** The EU5 queries over one resident session. */
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

  /** Run `read` on each snapshot of the campaign, in date order. */
  private history<T>(
    campaignId: string,
    read: (payload: Eu5Payload) => T | null,
  ): HistoryResult<T> {
    const timeline = this.store.timeline(campaignId);
    return {
      campaignId,
      snapshots: timeline.length,
      rows: timeline.map(({ id, contentHash, date, dateSort, gameVersion }) => ({
        id,
        contentHash,
        date,
        dateSort,
        gameVersion,
        value: read(this.store.read(id).payload),
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
      const rows = this.store.rowIndex(projection.layoutKey);
      let total = 0;
      for (const id of locationIds) {
        const row = rows.get(id);
        if (row === undefined) return null;
        total += projection.metrics[row * LOCATION_WIDTH + POPULATION_METRIC];
      }
      return total;
    });
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
    for (const { id } of this.store.timeline(campaignId)) {
      const { tables } = this.store.read(id).payload;
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
    for (const { id } of this.store.timeline(campaignId)) {
      const { tables } = this.store.read(id).payload;
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
    for (const [index, row] of this.store.timeline(campaignId).entries()) {
      const { tables } = this.store.read(row.id).payload;
      if (index) parts.push(",");
      // One string for each snapshot, so a large campaign does not make one huge string.
      parts.push(
        JSON.stringify(
          {
            game: row.game,
            campaignId: row.campaignId,
            date: row.date,
            gameVersion: row.gameVersion,
            contentHash: row.contentHash,
            extractorVersion: row.extractorVersion,
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
}
