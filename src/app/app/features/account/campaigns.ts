import { diff } from "@/lib/dates";
import type { UserSaves } from "@/server-lib/db";

export type NonEmptyArray<T> = readonly [T, ...T[]];
type MutableNonEmptyArray<T> = [T, ...T[]];
export type Eu4CampaignSave = UserSaves["saves"][number] & { name: string };
export type Eu5CampaignSave = UserSaves["eu5_saves"][number];

/**
 * A campaign is the unit of the saves page: one playthrough, in one game,
 * uploaded as a series of dated saves. EU5 names its playthroughs; EU4 does
 * not, so an EU4 campaign carries a name derived from the file name or, when
 * that is ambiguous, from the playthrough id.
 */
export type Campaign =
  | {
      game: "eu4";
      key: string;
      name: string;
      /** True when the name is generated, not something the player typed. */
      derivedName: boolean;
      latestUpload: string;
      saves: NonEmptyArray<Eu4CampaignSave>;
    }
  | {
      game: "eu5";
      key: string;
      name: string;
      derivedName: false;
      latestUpload: string;
      saves: NonEmptyArray<Eu5CampaignSave>;
    };

/** The game date as a number. EU5 saves use ISO 8601 dates. */
export function eu5DateOrdinal(date: string): number {
  const [y = 0, m = 0, d = 0] = date.split("-").map(Number);
  return y * 10000 + m * 100 + d;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Formats an ISO 8601 game date as the game displays it. */
export function formatGameDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return date;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function eu5Version(
  save: Pick<Eu5CampaignSave, "version_major" | "version_minor" | "version_patch">,
) {
  return `${save.version_major}.${save.version_minor}.${save.version_patch}`;
}

/**
 * EU5 saves group by their playthrough id, the identity the game keeps across
 * a campaign. Grouping by name instead would fold two different campaigns that
 * share a name into one, and split a campaign the player renamed. The name is
 * only for display, so a renamed campaign shows the name it carried at the
 * furthest point it reached, which is the campaign as it now stands. Taking
 * the name from the most recent upload instead would show a stale one when
 * the saves arrive out of order.
 */
export function groupEu5Campaigns(saves: readonly Eu5CampaignSave[]): Campaign[] {
  const groups = new Map<string, MutableNonEmptyArray<Eu5CampaignSave>>();
  for (const save of saves) {
    const group = groups.get(save.playthrough_id);
    if (group) {
      group.push(save);
    } else {
      groups.set(save.playthrough_id, [save]);
    }
  }

  return [...groups.entries()].map(([playthroughId, group]) => {
    group.sort((a, b) => eu5DateOrdinal(b.date) - eu5DateOrdinal(a.date));
    // Furthest first after the sort; the upload order only decides where the
    // campaign sits among the others.
    const furthest = group[0];
    const latestUpload = group.reduce(
      (latest, x) => (diff(x.upload_time, latest) > 0 ? x.upload_time : latest),
      furthest.upload_time,
    );
    return {
      game: "eu5",
      key: `eu5:${playthroughId}`,
      name: furthest.playthrough_name,
      derivedName: false,
      latestUpload,
      saves: group,
    };
  });
}

export function eu4Campaigns(groups: readonly NonEmptyArray<Eu4CampaignSave>[]): Campaign[] {
  return groups.map((group) => {
    const first = group[0];
    const latestUpload = group.reduce(
      (latest, x) => (diff(x.upload_time, latest) > 0 ? x.upload_time : latest),
      first.upload_time,
    );
    return {
      game: "eu4",
      key: `eu4:${first.playthrough_id}`,
      name: first.name,
      derivedName: first.filename !== first.name,
      latestUpload,
      saves: group,
    };
  });
}

/** Every campaign across both games, most recently uploaded first. */
export function mergeCampaigns(...lists: (readonly Campaign[])[]): Campaign[] {
  return lists.flat().sort((a, b) => diff(b.latestUpload, a.latestUpload));
}
