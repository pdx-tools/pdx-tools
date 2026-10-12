import { dayNumber, parseDate } from "@/features/timeline/date";
import type { FeedSave } from "@/server-lib/fn/feed";
import type { LocalSaveEntry } from "./localSaves";
import { campaignMembership } from "./types";
import type { CampaignSave, LocalSaveProblem, OpenSave } from "./types";

export type CampaignUpload = Pick<
  FeedSave,
  "game" | "id" | "date" | "filename" | "user_id" | "user_name"
>;

/** Keep unavailable files visible, but exclude them from step navigation. */
export function canOpen(save: { problem: LocalSaveProblem | null }): boolean {
  return save.problem === null || save.problem.kind === "moved";
}

/**
 * Build one timeline point per date. Prefer the open save, then usable local files.
 * Keep files selected with a campaign save visible while their membership is unknown.
 */
export function mergeCampaignSaves({
  open,
  uploads,
  entries,
  openEntry,
}: {
  open: OpenSave;
  /** The campaign's uploads, newest first, as the server sends them. */
  uploads: readonly CampaignUpload[];
  entries: readonly LocalSaveEntry[];

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
      membership: "same",
      problem: null,
    });
  }

  const ofGame = entries.flatMap((entry) => {
    const { identity } = entry;
    if (entry.game !== game || identity === null) return [];
    const membership = entry === openEntry ? "same" : campaignMembership(identity, open);
    return [{ entry, identity, membership }];
  });
  const campaignBatches = new Set(
    ofGame.filter((x) => x.membership === "same").map((x) => x.entry.batch),
  );
  if (openEntry !== undefined) campaignBatches.add(openEntry.batch);

  for (const { entry, identity, membership } of ofGame) {
    if (membership !== "same" && !campaignBatches.has(entry.batch)) continue;
    const isOpen = entry === openEntry;
    const date = isOpen ? open.date : identity.date;
    const day = dayNumber(date);
    const current = byDay.get(day);
    if (current !== undefined && !isOpen) {
      if (current.isOpen) continue;
      // Preserve a usable campaign save when a conflicting file has less reliable membership.
      if (!canOpen(entry) && canOpen(current)) continue;
      if (membership === "different" && current.membership !== "different") continue;
    }
    byDay.set(day, {
      key: `local:${entry.id}`,
      date,
      name: entry.name,
      isOpen,
      source: {
        kind: "local",
        entryId: entry.id,
        uploadedBy:
          current?.source.kind === "upload"
            ? current.source.userName
            : (current?.source.uploadedBy ?? null),
      },
      membership,
      problem: entry.problem,
    });
  }

  // Include the open save even when the server omits it from the returned uploads.
  const openDay = dayNumber(open.date);
  if (!byDay.get(openDay)?.isOpen) {
    byDay.set(openDay, {
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
          : { kind: "local", entryId: openEntry?.id ?? null, uploadedBy: null },
      membership: "same",
      problem: null,
    });
  }

  return [...byDay.entries()].sort(([a], [b]) => a - b).map(([, save]) => save);
}
