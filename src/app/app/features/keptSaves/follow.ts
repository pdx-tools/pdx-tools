import { dayNumber } from "@/features/timeline/date";
import type { DateComponents } from "@/features/timeline/date";
import type { UpdateMap } from "./types";

/** Whether a write is far enough from the open save for the map to follow it. */
export function isFarEnough(pace: UpdateMap, open: DateComponents, next: DateComponents): boolean {
  // The player reloaded an earlier save, or saved this date again.
  if (dayNumber(next) <= dayNumber(open)) return true;
  switch (pace) {
    case "EverySave":
    case "Daily":
      return true;
    case "Monthly":
      return next.year !== open.year || next.month !== open.month;
    case "Yearly":
      return next.year !== open.year;
  }
}

export type FollowInput = {
  armed: boolean;
  pace: UpdateMap;
  open: DateComponents;
  next: DateComponents;
  /** The first write after the player chose Latest always opens. */
  afterLatest: boolean;
  /** The player has work on the open save that a new save would end. */
  isProtected: boolean;
  /** A save is opening, or the player is in the middle of a short interaction. */
  isBusy: boolean;
};

export type FollowDecision =
  /** Offer the write as Latest. */
  | "offer"
  /** Offer it, and follow the next write that is far enough. */
  | "skip"
  /** Offer it, and follow no more until the player chooses Latest. */
  | "disarm"
  | "wait"
  | "open";

export function decideFollow(input: FollowInput): FollowDecision {
  if (!input.armed) return "offer";
  if (!input.afterLatest && !isFarEnough(input.pace, input.open, input.next)) return "skip";
  if (input.isProtected) return "disarm";
  return input.isBusy ? "wait" : "open";
}
