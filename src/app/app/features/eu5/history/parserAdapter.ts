import type { ParserAdapter } from "@/features/campaign/analysis/importScheduler";
import type { Eu5Snapshot } from "./analysisTypes";
import type { parseImport } from "./snapshot-worker";

/** The EU5 save parser for campaign analysis. Its worker loads the WASM parser and tokens. */
export const eu5ParserAdapter: ParserAdapter<{ parseImport: typeof parseImport }, Eu5Snapshot> = {
  refuse: (file) => (file.name.toLowerCase().endsWith(".eu5") ? null : "Not an EU5 save"),
  start: () => new Worker(new URL("./snapshot-worker.ts", import.meta.url), { type: "module" }),
  parse: (api, file) => api.parseImport(file),
  // The worker keeps the file and the parsed game state. The WASM memory of
  // the game state stays near 315 MiB for all save sizes.
  peakBytes: (file) => 512 * 1024 ** 2 + file.size,
};
