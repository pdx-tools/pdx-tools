import type { CampaignGame, PlaythroughId } from "./types";
import type { Eu4Carry } from "@/features/eu4/campaignCarry";
import type { Eu5Carry } from "@/features/eu5/campaignCarry";

type CampaignCarryMap = { eu4: Eu4Carry; eu5: Eu5Carry };

export type CampaignCarry = {
  [Game in CampaignGame]: { game: Game; payload: CampaignCarryMap[Game] };
}[CampaignGame];

/**
 * What a change of save keeps: the map mode, the camera, the selection.
 * The open save writes it just before the change, and the next save of the
 * same campaign reads it once as it loads. A save from another campaign
 * leaves it, so a save that the player opens by hand starts fresh.
 */
type Carry = CampaignCarry & {
  playthroughId: PlaythroughId;
  /** Time of the write, so a load that fails does not leave it for later. */
  at: number;
};

/** A save that takes longer than this to open starts fresh. */
const CARRY_TTL_MS = 5 * 60 * 1000;

let carry: Carry | null = null;

export function setCampaignCarry(playthroughId: PlaythroughId, view: CampaignCarry): void {
  carry = { ...view, playthroughId, at: Date.now() };
}

/** Drop the carry of a change of save that did not happen. */
export function dropCampaignCarry(): void {
  carry = null;
}

/**
 * The state that the previous save of this campaign left for this one. The
 * caller gets it once; the next call returns null.
 */
export function takeCampaignCarry<Game extends CampaignGame>(
  game: Game,
  playthroughId: PlaythroughId | null,
): CampaignCarryMap[Game] | null;
export function takeCampaignCarry(
  game: CampaignGame,
  playthroughId: PlaythroughId | null,
): CampaignCarryMap[CampaignGame] | null {
  const value = carry;
  carry = null;
  if (value === null || value.game !== game || value.playthroughId !== playthroughId) return null;
  if (Date.now() - value.at > CARRY_TTL_MS) return null;
  return value.payload;
}
