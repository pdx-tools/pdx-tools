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

type CampaignSaveInputs = {
  open: OpenSave;
  /** The campaign's uploads, newest first, as the server sends them. */
  uploads: readonly CampaignUpload[];
  entries: readonly LocalSaveEntry[];

  openEntry: LocalSaveEntry | undefined;
};

/**
 * Build one timeline point per date. Prefer the open save, then usable local files.
 * Keep files selected with a campaign save visible while their membership is unknown.
 */
export function mergeCampaignSaves(inputs: CampaignSaveInputs): CampaignSave[] {
  return mergeCampaign(inputs).saves;
}

/** A save of the campaign that the list left out, because another save has its date. */
export type LeftOutSave = Readonly<{ save: CampaignSave; kept: CampaignSave }>;

/** The timeline points, and the saves of the campaign that share a date with one. */
export function mergeCampaign({ open, uploads, entries, openEntry }: CampaignSaveInputs): {
  saves: CampaignSave[];
  leftOut: LeftOutSave[];
} {
  const { game } = open;
  const byDay = new Map<number, CampaignSave>();
  const dropped: CampaignSave[] = [];
  const isOpenUpload = (saveId: string) =>
    open.source.kind === "upload" && open.source.saveId === saveId;

  for (const save of uploads) {
    if (save.game !== game) continue;
    const date = parseDate(save.date);
    if (date === null) continue;
    const day = dayNumber(date);
    const upload: CampaignSave = {
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
    };
    const current = byDay.get(day);
    if (current && !isOpenUpload(save.id)) {
      dropped.push(upload);
      continue;
    }
    if (current) dropped.push(current);
    byDay.set(day, upload);
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
    const local: CampaignSave = {
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
    };
    if (current !== undefined && !isOpen) {
      // Preserve a usable campaign save when a conflicting file has less reliable membership.
      if (
        current.isOpen ||
        (!canOpen(entry) && canOpen(current)) ||
        (membership === "different" && current.membership !== "different")
      ) {
        dropped.push(local);
        continue;
      }
    }
    if (current) dropped.push(current);
    byDay.set(day, local);
  }

  // Include the open save even when the server omits it from the returned uploads.
  const openDay = dayNumber(open.date);
  if (!byDay.get(openDay)?.isOpen) {
    const current = byDay.get(openDay);
    if (current) dropped.push(current);
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

  const saves = [...byDay.entries()].sort(([a], [b]) => a - b).map(([, save]) => save);
  const kept = new Set(saves.map((save) => save.key));
  const leftOut = dropped.flatMap((save) =>
    kept.has(save.key) || save.membership === "different"
      ? []
      : [{ save, kept: byDay.get(dayNumber(save.date))! }],
  );
  return { saves, leftOut };
}
