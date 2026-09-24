/**
 * The games PDX Tools knows, and how much it can do with each.
 *
 * A game is `analysis` when the tool analyzes its saves, and `melt` when it
 * only converts a binary save to plaintext. A `melt` game needs no page.
 *
 * A hub route is a separate step. An `analysis` game gets one only when it
 * has a surface whose content exists only for that game. Until then, its
 * menu row leads to its campaigns in the saves feed. Adding a hub is a `to`
 * here plus the hub it earned, and never a change to the header.
 */
export type GameTier = "analysis" | "melt";

export type GameId = "eu4" | "eu5" | "ck3" | "hoi4" | "vic3" | "imperator";

export type Game = {
  id: GameId;
  /** How the game is named in a list, short enough for a menu row. */
  label: string;
  /** The full title, for the list on the landing page. */
  name: string;
  tier: GameTier;
  /** The oldest patch whose saves load. */
  since: string;
  /** The hub route, for an `analysis` game that has earned one. */
  to?: string;
};

export const games: readonly Game[] = [
  {
    id: "eu4",
    label: "EU4",
    name: "Europa Universalis IV",
    tier: "analysis",
    since: "1.29",
    to: "/eu4",
  },
  {
    id: "eu5",
    label: "EU5",
    name: "Europa Universalis V",
    tier: "analysis",
    since: "1.0",
  },
  {
    id: "ck3",
    label: "CK3",
    name: "Crusader Kings III",
    tier: "melt",
    since: "1.0",
  },
  {
    id: "hoi4",
    label: "HOI4",
    name: "Hearts of Iron IV",
    tier: "melt",
    since: "1.0",
  },
  {
    id: "vic3",
    label: "Victoria 3",
    name: "Victoria 3",
    tier: "melt",
    since: "1.0",
  },
  {
    id: "imperator",
    label: "Imperator",
    name: "Imperator: Rome",
    tier: "melt",
    since: "1.0",
  },
] as const;

export const analysisGames = games.filter((x) => x.tier === "analysis");
export const meltGames = games.filter((x) => x.tier === "melt");
