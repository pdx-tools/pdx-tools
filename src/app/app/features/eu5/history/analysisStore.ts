import { analyticalBuffers } from "./transferBuffers";
import type { AnalysisDescriptor, MapFrame, SaveAnalysis } from "./analysisTypes";
/** Own independent map column blocks; appending never copies previous observations. */
export class CampaignAnalysisStore {
  private bufferRefs = new Map<ArrayBuffer, number>();
  private residentBytes = 0;
  private saves = new Map<string, SaveAnalysis>();
  private layouts = new Map<string, Uint32Array<ArrayBuffer>>();
  private campaigns = new Map<string, AnalysisDescriptor[]>();
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
      frame.metrics.length !== n * 7 ||
      frame.fractions.length !== n * 2 ||
      [frame.owners, frame.controllers, frame.religions, frame.markets].some(
        (ids) => ids.length !== n,
      )
    )
      throw Error("Incomplete analytical map columns");
    const shared = this.layouts.get(frame.layoutKey);
    if (shared && (shared.length !== n || shared.some((id, i) => id !== frame.locationIds[i])))
      throw Error("Incompatible analytical map layout");
    if (shared) frame.locationIds = shared;
    else this.layouts.set(frame.layoutKey, frame.locationIds);
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
  mapFrame(hash: string): MapFrame {
    const save = this.saves.get(hash);
    if (!save)
      throw Error("This observation is no longer available. Import the original saves again.");
    return { ...save.projection, ...save.observation };
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
    for (const key of this.layouts.keys()) if (!used.has(key)) this.layouts.delete(key);
  }
  memoryBytes() {
    return this.residentBytes;
  }
}
