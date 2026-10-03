import { formatLongDate } from "@/features/timeline/date";
import { getErrorMessage } from "@/lib/getErrorMessage";
import type { CampaignSave, LocalSaveProblem, OpenFailure } from "./types";

/** Where a save comes from, as one short line. */
export function saveSourceText(save: CampaignSave): string {
  if (save.source.kind === "upload") {
    return save.source.userName ? `Upload by ${save.source.userName}` : "Upload";
  }
  return save.source.uploadedBy
    ? `Local file, also uploaded by ${save.source.uploadedBy}`
    : "Local file";
}

export function saveProblemText(problem: LocalSaveProblem): string {
  switch (problem.kind) {
    case "missing":
      return "This file is no longer available. Drop or pick it again to open it.";
    case "unreadable":
      return "This file could not be read as a save.";
    case "other-campaign":
      return "This file now holds another campaign.";
    case "moved":
      return `The game wrote a later save over this file, so its mark moved here from ${formatLongDate(problem.from)}.`;
  }
}

export function openFailureText(failure: OpenFailure): string {
  switch (failure.kind) {
    case "local":
      return saveProblemText(failure.problem);
    case "load":
      return getErrorMessage(failure.error);
    case "unavailable":
      return "The save could not be opened. Try again later.";
  }
}

/** The accessible name of a save: its date, then where it comes from. */
export function saveLabel(save: CampaignSave): string {
  return `Save, ${formatLongDate(save.date)}, ${saveSourceText(save).toLowerCase()}`;
}
