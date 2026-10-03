import type { CampaignGame, SaveHeader } from "../types";

/**
 * The campaign and date of a save file, without loading map assets. EU4
 * needs its gamestate fingerprint; EU5 needs only metadata. The module of
 * a game loads when the first file of that game arrives.
 */
export async function readSaveHeader(game: CampaignGame, file: File): Promise<SaveHeader> {
  switch (game) {
    case "eu4":
      return (await import("./eu4")).readEu4Header(file);
    case "eu5":
      return (await import("./eu5")).readEu5Header(file);
  }
}
