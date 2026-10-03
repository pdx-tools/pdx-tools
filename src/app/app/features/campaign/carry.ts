import type { CampaignGame, CampaignId } from "./types";

/**
 * What a change of save keeps: the map mode, the camera, the selection.
 * The open save writes it just before the change, and the next save of the
 * same campaign reads it once as it loads. A save from another campaign
 * leaves it, so a save that the player opens by hand starts fresh.
 */
type Carry = {
  game: CampaignGame;
  campaignId: CampaignId;
  payload: unknown;
  /** Time of the write, so a load that fails does not leave it for later. */
  at: number;
};

/** A save that takes longer than this to open starts fresh. */
const CARRY_TTL_MS = 5 * 60 * 1000;

let carry: Carry | null = null;

export function setCampaignCarry<T>(game: CampaignGame, campaignId: CampaignId, payload: T): void {
  carry = { game, campaignId, payload, at: Date.now() };
}

/** Drop the carry of a change of save that did not happen. */
export function dropCampaignCarry(): void {
  carry = null;
}

/**
 * The state that the previous save of this campaign left for this one. The
 * caller gets it once; the next call returns null.
 */
export function takeCampaignCarry<T>(game: CampaignGame, campaignId: CampaignId | null): T | null {
  const value = carry;
  carry = null;
  if (value === null || value.game !== game || value.campaignId !== campaignId) return null;
  if (Date.now() - value.at > CARRY_TTL_MS) return null;
  return value.payload as T;
}
