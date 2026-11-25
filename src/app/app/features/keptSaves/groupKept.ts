import type { CampaignGame } from "@/features/campaign/types";
import type { KeptIndex } from "./keptStore";
import type { KeptSave } from "./types";

export type KeptGroup = {
  key: string;
  game: CampaignGame;
  /** False for saves whose campaign could not be read. */
  isKnown: boolean;
  name: string;
  /** Newest write first. */
  saves: KeptSave[];
};

/** Group the kept saves by campaign, the last kept first. Saves of no known campaign lead. */
export function groupKept(
  saves: readonly KeptSave[],
  { writes }: Pick<KeptIndex, "writes">,
  game?: CampaignGame,
): KeptGroup[] {
  const seq = (save: KeptSave) => writes.get(save.hash)?.seq ?? 0;
  const groups = new Map<string, KeptGroup>();
  const lastKept = new Map<string, number>();
  for (const save of saves.toSorted((a, b) => seq(b) - seq(a))) {
    if (game !== undefined && save.game !== game) continue;
    const isKnown = save.playthroughId !== null;
    const key = `${save.game}:${save.playthroughId ?? ""}`;
    const name = isKnown ? "" : "Campaign not known";
    const group = groups.get(key) ?? {
      key,
      game: save.game,
      isKnown,
      name,
      saves: [],
    };
    groups.set(key, group);
    group.saves.push(save);
    group.name ||= save.countryName ?? "";
    lastKept.set(key, Math.max(lastKept.get(key) ?? 0, save.keptAt));
  }
  for (const group of groups.values()) group.name ||= "Campaign";
  return [...groups.values()].toSorted(
    (a, b) => Number(a.isKnown) - Number(b.isKnown) || lastKept.get(b.key)! - lastKept.get(a.key)!,
  );
}
