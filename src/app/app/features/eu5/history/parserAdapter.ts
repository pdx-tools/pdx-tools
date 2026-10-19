import type { ParserAdapter } from "@/features/campaign/analysis/importScheduler";
import type { SaveAnalysis } from "./analysisTypes";
import type { parseImport } from "./snapshot-worker";

/** The EU5 save parser for campaign analysis. */
export const eu5ParserAdapter: ParserAdapter<{ parseImport: typeof parseImport }, SaveAnalysis> = {
  refuse: (file) => (file.name.toLowerCase().endsWith(".eu5") ? null : "Not an EU5 save"),
  start: () => new Worker(new URL("./snapshot-worker.ts", import.meta.url), { type: "module" }),
  parse: (api, file) => api.parseImport(file),
  // The full parser keeps the file and the game state.
  peakBytes: (file) => 768 * 1024 ** 2 + file.size,
};
