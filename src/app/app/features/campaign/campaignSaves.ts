import { dayNumber, parseDate } from "@/features/timeline/date";
import type { FeedSave } from "@/server-lib/fn/feed";
import type { LocalSaveEntry } from "./localSaves";
import { samePlaythrough } from "./types";
import type { CampaignSave, LocalSaveProblem, OpenSave } from "./types";

/**
 * True when a step can go to the save. A file that is gone or now holds
 * something else stays on the timeline with its problem, and a step goes
 * past it. A moved file opens at its new date.
 */
export function canOpen(save: { problem: LocalSaveProblem | null }): boolean {
  return save.problem === null || save.problem.kind === "moved";
}

/**
 * The saves of the open campaign, in date order: its uploads and the local
 * files of its stable campaign identity. Saves of one date are one point.
 * The open save keeps its point. Otherwise, a local file that can open
 * wins over an upload, because it needs no download. Of two uploads, the
 * newer upload stays.
 */
export function mergeCampaignSaves({
  open,
  uploads,
  entries,
  openEntry,
}: {
  open: OpenSave;
  /** The campaign's uploads, newest first, as the server sends them. */
  uploads: readonly FeedSave[];
  entries: readonly LocalSaveEntry[];
  /** The local entry of the open save, if the open save is a local file. */
  openEntry: LocalSaveEntry | undefined;
}): CampaignSave[] {
  const { game } = open;
  const byDay = new Map<number, CampaignSave>();
  const isOpenUpload = (saveId: string) =>
    open.source.kind === "upload" && open.source.saveId === saveId;

  for (const save of uploads) {
    if (save.game !== game) continue;
    const date = parseDate(save.date);
    if (date === null) continue;
    const day = dayNumber(date);
    if (byDay.has(day) && !isOpenUpload(save.id)) continue;
    byDay.set(day, {
      key: `upload:${save.id}`,
      date,
      name: save.filename,
      isOpen: isOpenUpload(save.id),
      source: {
        kind: "upload",
        saveId: save.id,
        uploaderId: save.user_id,
        userName: save.user_name,
      },
      problem: null,
    });
  }

  for (const entry of entries) {
    if (entry.game !== game || entry.header === null) continue;
    if (!samePlaythrough(entry.header.playthroughId, open.playthroughId)) continue;
    const day = dayNumber(entry.header.date);
    const current = byDay.get(day);
    const isOpen = entry === openEntry;
    // An open upload stays the open point, as it has the permalink.
    if (current?.isOpen && !isOpen) continue;
    // A file that cannot open does not hide a save of the same date that can.
    if (current !== undefined && !isOpen && !canOpen(entry) && canOpen(current)) continue;
    byDay.set(day, {
      key: `local:${entry.id}`,
      date: entry.header.date,
      name: entry.name,
      isOpen,
      source: {
        kind: "local",
        entryId: entry.id,
        uploadedBy: current?.source.kind === "upload" ? current.source.userName : null,
      },
      problem: entry.problem,
    });
  }

  // The open save is on the timeline also when no list has it, such as an
  // upload older than the newest that the server sends.
  if (![...byDay.values()].some((x) => x.isOpen)) {
    byDay.set(dayNumber(open.date), {
      key: "open",
      date: open.date,
      name: open.name,
      isOpen: true,
      source:
        open.source.kind === "upload"
          ? {
              kind: "upload",
              saveId: open.source.saveId,
              uploaderId: open.source.uploaderId,
              userName: "",
            }
          : { kind: "local", entryId: openEntry?.id ?? "", uploadedBy: null },
      problem: null,
    });
  }

  return [...byDay.entries()].sort(([a], [b]) => a - b).map(([, save]) => save);
}
