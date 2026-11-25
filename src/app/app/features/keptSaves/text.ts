import type { CampaignSave } from "@/features/campaign/types";
import { formatIsoDate, formatLongDate, sameDate } from "@/features/timeline/date";
import type { DateComponents } from "@/features/timeline/date";
import { formatGameDate } from "@/features/saves/gameDate";
import { formatInt, pluralize } from "@/lib/format";
import { GB } from "./types";
import type { KeptSave } from "./types";
import { isActive } from "./keptStore";
import type { RejectedFile } from "./capture";
import type { KeptState } from "./keptStore";

export const UNSUPPORTED = "This browser cannot watch folders or keep copies.";
export const UNSUPPORTED_HELP =
  "Use Chrome or Edge 133 or later on a computer. Saves open here as before.";
export const COPY_MISSING = "This copy is no longer in the browser's storage.";
export const OVERWRITTEN_OPEN = "The game has written over this file. The map shows the kept copy.";
export const OVERWRITTEN_FILE = "The game has written over this file.";

/** `4.7 MB`, `154 MB`, `9.49 GB` */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${Number((bytes / GB).toFixed(2))} GB`;
  const mb = bytes / 1e6;
  if (mb < 1) return `${formatInt(Math.max(1, bytes / 1e3))} KB`;
  return `${Number(mb.toFixed(mb < 100 ? 1 : 0))} MB`;
}

/** `20:47` */
export function formatClock(time: number): string {
  return new Date(time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** `today 20:47`, `23 Nov 22:40` */
export function formatWhen(time: number, now = Date.now()): string {
  const date = new Date(time);
  if (date.toDateString() === new Date(now).toDateString()) return `today ${formatClock(time)}`;
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  const day = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(!sameYear && { year: "numeric" }),
  });
  return `${day} ${formatClock(time)}`;
}

/** `1 August 1528`, as the pages outside a save show dates. */
export function formatPageDate(date: DateComponents | null): string {
  return date === null ? "Date not known" : formatGameDate(formatIsoDate(date));
}

/** An estimate does not need more than two digits. */
function formatAbout(count: number): string {
  const unit = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, count))) - 1);
  return formatInt(Math.floor(count / unit) * unit);
}

/** `2 saves`, `2 EU4 saves` */
export const savesText = (count: number, label?: string) =>
  pluralize(label ? `${label} save` : "save", count);

/** `about 2,100 saves`, `4 more saves` */
export function roomText(room: number, label?: string): string {
  if (room < 10) return savesText(room, label);
  return ["about", formatAbout(room), label, "saves"].filter(Boolean).join(" ");
}

/** Where the file of a kept save is now, as far as the watch knows. */
export type FileState = "in-folder" | "last-seen" | "overwritten" | "unknown";

export function fileState(
  save: Pick<KeptSave, "hash" | "game" | "watchId">,
  { index, watches, folders, live }: Pick<KeptState, "index" | "watches" | "folders" | "live">,
): FileState {
  const { game, hash, watchId } = save;
  if (index.held.has(hash)) return isActive(live[game]) ? "in-folder" : "last-seen";
  const folder = folders[game];
  if (folder === undefined || folder.watchId !== watches[game]?.id) return "unknown";
  // A file that the player moved or deleted was not written over.
  const isGone = folder.manifest.some((x) => x.hash === hash && x.state === "gone");
  return watchId === folder.watchId && !isGone ? "overwritten" : "unknown";
}

export const pageFileText: Record<FileState, string> = {
  "in-folder": "In the save folder",
  "last-seen": "Last seen in the folder",
  overwritten: "Written over by the game",
  unknown: "",
};

export const listFileText: Record<FileState, string> = {
  "in-folder": "In the save folder.",
  "last-seen": "Last seen in the folder.",
  overwritten: OVERWRITTEN_FILE,
  unknown: "",
};

/** The date, with the write time when another save shares the date. */
export function saveDateText(save: CampaignSave, others: readonly CampaignSave[]): string {
  const date = formatLongDate(save.date);
  const shared = others.some((x) => x.key !== save.key && sameDate(x.date, save.date));
  return shared && save.writtenAt !== null ? `${date}, ${formatClock(save.writtenAt)}` : date;
}

/** What a resumed watch found, and what it cannot find. */
export function resumedText({ kept, from, to }: { kept: number; from: number; to: number }) {
  const found =
    kept === 0
      ? "No new saves found."
      : `Kept ${savesText(kept)} that ${kept === 1 ? "was" : "were"} new in the folder.`;
  // A reload takes no time in which the game could write.
  if (to - from < 60_000) return found;
  return `${found} Saves overwritten between ${formatWhen(from)} and ${formatWhen(to)} cannot be recovered.`;
}

/** Why a file was not kept, in two parts. */
export function rejectedText({ name, writtenAt, integrity }: RejectedFile): [string, string] {
  const isIncomplete = integrity === "incomplete";
  const what = isIncomplete ? "a complete save" : "a save that PDX Tools can read";
  return [
    `${name}, written ${formatClock(writtenAt)}, is not ${what}.`,
    `It was not kept.${isIncomplete ? " The next write is tried again." : ""}`,
  ];
}
