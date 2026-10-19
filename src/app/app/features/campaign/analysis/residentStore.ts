import { compareDescriptors, snapshotId } from "./descriptor";
import type { SnapshotDescriptor } from "./descriptor";
import { collectBuffers } from "./transferBuffers";

/** The error name when a snapshot does not fit in the memory limit. */
export const MEMORY_LIMIT_ERROR = "AnalysisMemoryLimit";

/** Geographic IDs in row order. Snapshots with the same key can keep one copy. */
export type LayoutColumn = { key: string; ids: Uint32Array<ArrayBuffer> };

/** The game rules for a payload. The store does not know the payload format. */
export type PayloadAdapter<D extends SnapshotDescriptor, P> = {
  game: string;
  extractorVersion: number;
  /** Throw if the payload is incomplete or does not agree with the descriptor. */
  validate(descriptor: D, payload: P): void;
  /** The layouts of the payload. */
  layouts?(payload: P): LayoutColumn[];
  /** Replace the IDs of a layout with the resident copy that has equal IDs. */
  useLayout?(payload: P, key: string, ids: Uint32Array<ArrayBuffer>): void;
  /** Replace each string with the resident copy. */
  internStrings?(payload: P, intern: (value: string) => string): void;
};

export type ResidentSnapshot<D, P> = { descriptor: D; payload: P };
export type AppendResult<D> = { descriptor: D; duplicate: boolean };

export type ResidentMemory = {
  /** Strict: the bytes of the backing buffers, each counted once. */
  bufferBytes: number;
  limitBytes: number;
  snapshots: number;
  layouts: number;
  /** An estimate. Strings and indexes are not part of the limit. */
  stringBytes: number;
  indexBytes: number;
};

type Block<D, P> = ResidentSnapshot<D, P> & {
  buffers: ArrayBuffer[];
  layouts: string[];
  strings: string[];
};
type Layout = { ids: Uint32Array<ArrayBuffer>; snapshots: number; rows?: Map<number, number> };

// V8 keeps a short one-byte string in about its length plus a 24-byte header.
const STRING_OVERHEAD = 24;
// A Map entry with small integer keys and values is about 40 bytes.
const INDEX_ENTRY_BYTES = 40;

/**
 * Immutable snapshot blocks of one game and one extractor version. A session
 * can hold several campaigns. An append never copies earlier blocks, and an
 * append that fails does not change the store.
 */
export class ResidentStore<D extends SnapshotDescriptor, P> {
  private blocks = new Map<string, Block<D, P>>();
  private campaigns = new Map<string, D[]>();
  private bufferRefs = new Map<ArrayBuffer, number>();
  private bufferBytes = 0;
  private layouts = new Map<string, Layout>();
  private strings = new Map<string, { value: string; snapshots: number }>();
  private stringBytes = 0;

  constructor(
    private readonly adapter: PayloadAdapter<D, P>,
    private readonly limitBytes = Infinity,
  ) {}

  append(descriptor: D, payload: P): AppendResult<D> {
    const { adapter } = this;
    if (
      descriptor.game !== adapter.game ||
      descriptor.extractorVersion !== adapter.extractorVersion
    )
      throw Error(
        `This store accepts ${adapter.game} snapshots from extractor ${adapter.extractorVersion}`,
      );
    if (
      !descriptor.contentHash ||
      !descriptor.campaignId ||
      !Number.isInteger(descriptor.dateSort) ||
      descriptor.id !==
        snapshotId(descriptor.game, descriptor.extractorVersion, descriptor.contentHash)
    )
      throw Error("Invalid snapshot descriptor");
    const campaign = this.campaigns.get(descriptor.campaignId) ?? [];
    const occupant = campaign.find((item) => item.dateSort === descriptor.dateSort);
    if (occupant && occupant.id !== descriptor.id)
      throw Error(
        `A different save already occupies ${descriptor.date}. Separate alternate campaign branches before importing.`,
      );
    const existing = this.blocks.get(descriptor.id);
    if (existing) return { descriptor: existing.descriptor, duplicate: true };

    // Prepare the payload. The store does not change until every step passes.
    adapter.validate(descriptor, payload);
    const columns = adapter.layouts?.(payload) ?? [];
    for (const { key, ids } of columns) {
      const shared = this.layouts.get(key);
      if (!shared) continue;
      if (shared.ids.length !== ids.length || shared.ids.some((id, i) => id !== ids[i]))
        throw Error("Incompatible analytical map layout");
      if (ids !== shared.ids) adapter.useLayout?.(payload, key, shared.ids);
    }
    // The resident copy of each string that this snapshot uses.
    const strings = new Map<string, string>();
    adapter.internStrings?.(payload, (value) => {
      const kept = this.strings.get(value)?.value ?? strings.get(value) ?? value;
      strings.set(value, kept);
      return kept;
    });
    // Count what the payload keeps now, not what the adapter says it replaced.
    const buffers = collectBuffers(payload);
    const added = buffers
      .filter((buffer) => !this.bufferRefs.has(buffer))
      .reduce((sum, buffer) => sum + buffer.byteLength, 0);
    if (this.bufferBytes + added > this.limitBytes) {
      const error = Error(
        `Campaign analysis is full. It keeps at most ${mib(this.limitBytes)} of snapshots in memory.`,
      );
      error.name = MEMORY_LIMIT_ERROR;
      throw error;
    }

    // Commit. Nothing below calls the adapter or can fail.
    for (const buffer of buffers) this.retain(buffer);
    for (const { key, ids } of columns) {
      const shared = this.layouts.get(key);
      if (shared) shared.snapshots++;
      else {
        // A layout keeps its IDs, also after the snapshot that added them goes.
        this.layouts.set(key, { ids, snapshots: 1 });
        this.retain(ids.buffer);
      }
    }
    for (const [value, kept] of strings) {
      const entry = this.strings.get(value);
      if (entry) entry.snapshots++;
      else {
        this.strings.set(value, { value: kept, snapshots: 1 });
        this.stringBytes += value.length + STRING_OVERHEAD;
      }
    }
    this.blocks.set(descriptor.id, {
      descriptor,
      payload,
      buffers,
      layouts: columns.map((column) => column.key),
      strings: [...strings.keys()],
    });
    campaign.push(descriptor);
    campaign.sort(compareDescriptors);
    this.campaigns.set(descriptor.campaignId, campaign);
    return { descriptor, duplicate: false };
  }

  private retain(buffer: ArrayBuffer) {
    const count = this.bufferRefs.get(buffer) ?? 0;
    if (!count) this.bufferBytes += buffer.byteLength;
    this.bufferRefs.set(buffer, count + 1);
  }

  private release(buffer: ArrayBuffer) {
    const count = this.bufferRefs.get(buffer)! - 1;
    if (count) this.bufferRefs.set(buffer, count);
    else {
      this.bufferRefs.delete(buffer);
      this.bufferBytes -= buffer.byteLength;
    }
  }

  /** The snapshots of a campaign in date order, as they are now. */
  timeline(campaignId: string): D[] {
    return [...(this.campaigns.get(campaignId) ?? [])];
  }

  read(id: string): ResidentSnapshot<D, P> {
    const block = this.blocks.get(id);
    if (!block)
      throw Error("This observation is no longer available. Import the original saves again.");
    return block;
  }

  /** The row of each geographic ID in a resident layout. */
  rowIndex(layoutKey: string): ReadonlyMap<number, number> {
    const layout = this.layouts.get(layoutKey);
    if (!layout) throw Error(`No resident snapshot has the layout ${layoutKey}`);
    if (!layout.rows) {
      layout.rows = new Map();
      for (let row = 0; row < layout.ids.length; row++) layout.rows.set(layout.ids[row], row);
    }
    return layout.rows;
  }

  /** Release the snapshots of one campaign, or of all campaigns. */
  clear(campaignId?: string) {
    for (const [id, block] of this.blocks) {
      if (campaignId !== undefined && block.descriptor.campaignId !== campaignId) continue;
      for (const buffer of block.buffers) this.release(buffer);
      for (const key of block.layouts) {
        const layout = this.layouts.get(key)!;
        if (--layout.snapshots) continue;
        this.release(layout.ids.buffer);
        this.layouts.delete(key);
      }
      for (const value of block.strings) {
        const entry = this.strings.get(value)!;
        if (--entry.snapshots) continue;
        this.strings.delete(value);
        this.stringBytes -= value.length + STRING_OVERHEAD;
      }
      this.blocks.delete(id);
    }
    if (campaignId === undefined) this.campaigns.clear();
    else this.campaigns.delete(campaignId);
  }

  memory(): ResidentMemory {
    let indexBytes = 0;
    for (const layout of this.layouts.values())
      indexBytes += (layout.rows?.size ?? 0) * INDEX_ENTRY_BYTES;
    return {
      bufferBytes: this.bufferBytes,
      limitBytes: this.limitBytes,
      snapshots: this.blocks.size,
      layouts: this.layouts.size,
      stringBytes: this.stringBytes,
      indexBytes,
    };
  }
}

const mib = (bytes: number) => `${Math.round(bytes / 1024 ** 2)} MiB`;

/**
 * The limit for resident buffers: a quarter of the device memory, from
 * 256 MiB to 1.5 GiB. The browser reports at most 8 GiB.
 */
export function residentMemoryLimit(deviceMemoryGiB = 4) {
  return Math.min(1536, Math.max(256, (deviceMemoryGiB * 1024) / 4)) * 1024 ** 2;
}
