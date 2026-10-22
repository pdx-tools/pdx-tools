import { compareDescriptors, snapshotId } from "./descriptor";
import type { SnapshotDescriptor } from "./descriptor";
import { collectBuffers } from "./transferBuffers";

/** The error name when a snapshot does not fit in the memory limit. */
export const MEMORY_LIMIT_ERROR = "AnalysisMemoryLimit";

/** Geographic IDs in row order. Snapshots with the same key can keep one copy. */
export type LayoutColumn = { key: string; ids: Uint32Array<ArrayBuffer> };

/** The game rules for a payload. The store does not know the payload format. */
export type PayloadAdapter<D extends SnapshotDescriptor, P> = {
  game: D["game"];
  extractorVersion: number;
  /** Throw if the payload is incomplete or does not agree with the descriptor. */
  validate(descriptor: D, payload: P): void;
  /** The layouts of the payload. */
  layouts?(payload: P): LayoutColumn[];
  /** Replace the IDs of a layout with the resident copy that has equal IDs. */
  useLayout?(payload: P, key: string, ids: Uint32Array<ArrayBuffer>): void;
};

export type ResidentSnapshot<D, P> = { descriptor: D; payload: P };
export type AppendResult<D> = { descriptor: D; duplicate: boolean };

export type ResidentMemory = {
  /** Strict: the bytes of the backing buffers, each counted once. */
  bufferBytes: number;
  snapshots: number;
  layouts: number;
};

type Block<D, P> = ResidentSnapshot<D, P> & {
  buffers: ArrayBuffer[];
  layouts: string[];
};
type Layout = { ids: Uint32Array<ArrayBuffer>; snapshots: number };

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

  constructor(private readonly adapter: PayloadAdapter<D, P>) {}

  /**
   * Add a snapshot. All buffers of the store, with the buffers that it adds,
   * must fit in `limitBytes`, which the tab-wide admission gives.
   */
  append(descriptor: D, payload: P, limitBytes = Infinity): AppendResult<D> {
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

    // Prepare the payload. The store does not change until every step passes,
    // but `useLayout` can change the payload of a refused append.
    adapter.validate(descriptor, payload);
    const columns = adapter.layouts?.(payload) ?? [];
    for (const { key, ids } of columns) {
      const shared = this.layouts.get(key);
      if (!shared || shared.ids === ids) continue;
      if (shared.ids.length !== ids.length || shared.ids.some((id, i) => id !== ids[i]))
        throw Error("Incompatible analytical map layout");
      adapter.useLayout?.(payload, key, shared.ids);
    }
    // Count what the payload keeps now, not what the adapter says it replaced.
    const buffers = collectBuffers(payload);
    const added = buffers
      .filter((buffer) => !this.bufferRefs.has(buffer))
      .reduce((sum, buffer) => sum + buffer.byteLength, 0);
    if (this.bufferBytes + added > limitBytes) {
      const error = Error("Campaign analysis is full. It has no memory for more snapshots.");
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
    this.blocks.set(descriptor.id, {
      descriptor,
      payload,
      buffers,
      layouts: columns.map((column) => column.key),
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
      this.blocks.delete(id);
    }
    if (campaignId === undefined) this.campaigns.clear();
    else this.campaigns.delete(campaignId);
  }

  memory(): ResidentMemory {
    return {
      bufferBytes: this.bufferBytes,
      snapshots: this.blocks.size,
      layouts: this.layouts.size,
    };
  }
}
