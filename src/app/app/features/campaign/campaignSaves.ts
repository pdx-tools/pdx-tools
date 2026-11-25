import { dayNumber, parseDate } from "@/features/timeline/date";
import type { FeedSave } from "@/server-lib/fn/feed";
import type { LocalSaveEntry } from "./localSaves";
import { campaignMembership, KEPT_BATCH } from "./types";
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
 * Build one timeline point per save. A local save has its content as identity,
 * so saves of one date stay apart. The open save and usable local files win
 * over an upload of the same save. Keep files selected with a campaign save
 * visible while their membership is unknown.
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
  campaignBatches.delete(KEPT_BATCH);

  const byContent = new Map<string, CampaignSave & { uploadedId: string | null }>();
  for (const { entry, identity, membership } of ofGame) {
    if (membership !== "same" && !campaignBatches.has(entry.batch)) continue;
    const isOpen = entry === openEntry;
    const openHash = isOpen && open.source.kind === "local" ? open.source.hash : null;
    const hash = openHash ?? entry.hash;
    const content = hash ?? entry.id;
    const current = byContent.get(content);
    // Show the same bytes once: the open save, then the copy, which does not change.
    if (current?.isOpen || (current?.kept && !isOpen)) {
      if (entry.kept) byContent.set(content, { ...current, kept: entry.kept });
      // The row also stands for a file that lost the save of its mark.
      else if (current.kept === null && entry.problem?.kind === "moved") {
        byContent.set(content, { ...current, problem: entry.problem });
      }
      continue;
    }
    byContent.set(content, {
      key: `local:${entry.id}`,
      date: isOpen ? open.date : identity.date,
      name: entry.name,
      isOpen,
      source: { kind: "local", entryId: entry.id, uploadedBy: null },
      membership,
      problem: entry.problem ?? (isOpen && !entry.kept ? (current?.problem ?? null) : null),
      kept: entry.kept ?? current?.kept ?? null,
      hash,
      writtenAt: entry.kept?.writtenAt ?? entry.version?.lastModified ?? null,
      uploadedId: entry.kept?.uploadedId ?? entry.uploadedId,
    });
  }
  const locals = [...byContent.values()];

  const onDay = <T extends { date: CampaignSave["date"] }>(saves: readonly T[], day: number) =>
    saves.filter((save) => dayNumber(save.date) === day);
  const points: CampaignSave[] = [];
  const replaced = new Set<CampaignSave>();
  const shared = new Map<CampaignSave, string>();
  const dated = uploads.flatMap((upload) => {
    const date = upload.game === game ? parseDate(upload.date) : null;
    return date === null ? [] : [{ upload, date }];
  });
  for (const { upload, date } of dated) {
    const day = dayNumber(date);
    const exact = locals.find((save) => save.uploadedId === upload.id);
    // The server does not tell which file an upload came from. Match it to a
    // file on disk only when nothing else has its date.
    const sameDay = onDay(locals, day).filter((x) => x.membership === "same");
    const single =
      sameDay.length === 1 && sameDay[0].uploadedId === null && onDay(dated, day).length === 1;
    const local = exact ?? (single && sameDay[0].kept === null ? sameDay[0] : undefined);
    const isOpen = open.source.kind === "upload" && open.source.saveId === upload.id;
    if (local !== undefined && !isOpen && (local.isOpen || canOpen(local))) {
      shared.set(local, upload.user_name);
      continue;
    }
    if (local !== undefined) replaced.add(local);
    points.push({
      key: `upload:${upload.id}`,
      date,
      name: upload.filename,
      isOpen,
      source: {
        kind: "upload",
        saveId: upload.id,
        uploaderId: upload.user_id,
        userName: upload.user_name,
      },
      membership: "same",
      problem: null,
      kept: local?.kept ?? null,
      hash: local?.hash ?? null,
      writtenAt: local?.writtenAt ?? null,
    });
  }
  for (const local of locals) {
    if (replaced.has(local)) continue;
    const { uploadedId: _, ...save } = local;
    const uploadedBy = shared.get(local) ?? null;
    points.push({
      ...save,
      source: save.source.kind === "local" ? { ...save.source, uploadedBy } : save.source,
    });
  }

  // Include the open save even when no list has it.
  if (!points.some((save) => save.isOpen)) {
    points.push({
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
      kept: null,
      hash: null,
      writtenAt: null,
    });
  }

  return points.sort(
    (a, b) =>
      dayNumber(a.date) - dayNumber(b.date) ||
      (a.writtenAt ?? 0) - (b.writtenAt ?? 0) ||
      (a.hash ?? a.key).localeCompare(b.hash ?? b.key),
  );
}
