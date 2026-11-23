import type { PauseReason } from "@/features/campaign/analysis/analysisState";
import type { SaveAnalysisStatus } from "@/features/campaign/saveAnalysisPresentation";

/** What the band reads of the campaign: each known save's status, and the reading. */
export type BandInput = {
  saves: readonly { status: SaveAnalysisStatus; retry: boolean }[];
  /** Saves added but not identified yet, so not on the axis. */
  identifying: number;
  reading: { downloading: boolean } | null;
  pause: PauseReason | null;
  waitingUploads: number;
};

export type Band = { kind: "reading" | "stopped" | "lost" | "uploads" | "full"; text: string };

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The bands above the chart, in their fixed order: reading or stopped, then
 * downloads, then full. The counts come from each save's status, as the axis
 * marks and the points do.
 */
export function analysisBands({ saves, identifying, reading, pause, waitingUploads }: BandInput) {
  const read = saves.filter((x) => x.status === "ready").length;
  // Before a chart, the next step carries the one action.
  if (saves.length < 2) return [];
  const known = saves.length + identifying;
  const lost = saves.filter((x) => x.status === "failed" && x.retry).length;
  const bands: Band[] = [];
  if (reading)
    bands.push({
      kind: "reading",
      text: `${reading.downloading ? "Downloading" : "Reading"} ${read} of ${count(known, "save", "saves")}`,
    });
  else if (pause && pause !== "full")
    bands.push({
      kind: "stopped",
      text: `Stopped: ${read} of ${count(known, "save", "saves")} read.`,
    });
  if (!reading && lost > 0)
    bands.push({ kind: "lost", text: `Couldn't download ${count(lost, "upload", "uploads")}.` });
  else if (!reading && !pause && waitingUploads > 0)
    bands.push({
      kind: "uploads",
      text: `${count(waitingUploads, "upload", "uploads")} not read.`,
    });
  if (pause === "full")
    bands.push({
      kind: "full",
      text: `Analysis is full. ${count(known - read, "save isn't", "saves aren't")} charted.`,
    });
  return bands;
}

/** Why reading stopped, for the next step before a chart, and whether Resume can help. */
export function pauseNote(
  pause: PauseReason | null,
  issues: readonly string[],
): { text: string; resume: boolean } | null {
  switch (pause) {
    case null:
      return null;
    case "stopped":
      return { text: "Reading stopped.", resume: true };
    case "failed":
      return { text: issues[0] ?? "Reading stopped unexpectedly.", resume: true };
    case "full":
      return { text: "Analysis is full. New figures aren't kept.", resume: false };
  }
}
