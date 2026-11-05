import type { StoryParts } from "./storyImage";

type Row = StoryParts["rows"][number];

/**
 * What a story image of a past date has for its rows. The save has land for each date
 * and all else only for the save date, so a past date has land only. A figure of the
 * save date under a title of a past date would be false.
 */
export function pastStoryRows(
  realms: readonly { name: string; colorHex: string; locations: number }[],
): Row[] {
  return realms.slice(0, 8).map((realm) => ({
    name: realm.name,
    color: realm.colorHex,
    shown: `${realm.locations}`,
  }));
}

/** The name of a row in a group's image has the person who plays it. */
export function rowWithPlayer(name: string, player: string | undefined): string {
  return player ? `${name} (${player})` : name;
}

/** The land of a history up to the save, as chart points and the value on one year */
export function landPoints(points: readonly { year: number; locations: number }[]) {
  return points.map((p): [number, number] => [p.year, p.locations]);
}
