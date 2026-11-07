import { formatInt } from "@/lib/format";

/** A rank as a reader must take it: "=#1" when other countries share it */
export function rankLabel(rank: number, tied = 1): string {
  return `${tied > 1 ? "=" : ""}#${formatInt(rank)}`;
}
