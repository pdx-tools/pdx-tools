import type { ParserAdapter } from "@/features/campaign/analysis/importScheduler";
import type { Eu4SaveAnalysis } from "./analysisTypes";
import type { parseImport } from "./snapshot-worker";

/**
 * The EU4 save parser for campaign analysis. Its worker loads the WASM
 * parser and tokens, but no game data. The file name is the only check
 * before the parse: the metadata has only a hint of the campaign.
 */
export const eu4ParserAdapter: ParserAdapter<{ parseImport: typeof parseImport }, Eu4SaveAnalysis> =
  {
    refuse: (file) => (/\.eu4(\.zst)?$/i.test(file.name) ? null : "Not an EU4 save"),
    start: () => new Worker(new URL("./snapshot-worker.ts", import.meta.url), { type: "module" }),
    parse: (api, file) => api.parseImport(file),
    // The worker keeps the file, a copy in WASM memory and the parsed save.
    peakBytes: (file) => 64 * 1024 ** 2 + 4 * file.size,
  };
