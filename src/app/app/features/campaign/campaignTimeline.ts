import type { CampaignSave } from "./types";

export type PublishedCampaignTimeline = { key: string | null; saves: readonly CampaignSave[] };

/** Publish a new set of dates together, without delaying navigation or analysis. */
export function publishCampaignTimeline(
  previous: PublishedCampaignTimeline,
  key: string | null,
  saves: readonly CampaignSave[],
  pending: number,
): PublishedCampaignTimeline {
  if (previous.key !== key)
    return { key, saves: pending > 0 ? saves.filter((save) => save.isOpen) : saves };
  if (pending > 0) {
    const openKey = saves.find((save) => save.isOpen)?.key;
    const changed = previous.saves.some((save) => save.isOpen !== (save.key === openKey));
    if (!changed) return previous;
    return {
      key,
      saves: previous.saves.map((save) => ({ ...save, isOpen: save.key === openKey })),
    };
  }
  if (previous.saves === saves) return previous;
  return { key, saves };
}
