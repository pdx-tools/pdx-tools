import { expect, it, vi } from "vitest";
import { create } from "zustand";

const mocks = vi.hoisted(() => ({ importBatch: vi.fn() }));
vi.mock("./importScheduler", () => ({
  importBatch: (files: File[], _parser: unknown, sink: unknown, options: unknown) =>
    mocks.importBatch(files, options, sink),
}));
import { campaignAnalysisState } from "./analysisState";
import type { CampaignAnalysisState } from "./analysisState";
import { campaignAnalyzer } from "./analyzeCampaign";
import { localSaveRegistry } from "@/features/campaign/localSaves";

const done = {
  files: [],
  outcomes: { accepted: 0, duplicate: 0, failed: 0, refused: 0, unprocessed: 0, cancelled: 0 },
  failures: [],
  memoryFull: null,
};

it("keeps local reads on the session that the import claimed", async () => {
  const history = create<CampaignAnalysisState>()((set) => campaignAnalysisState(set));
  const session = new AbortController();
  let generation = 1;
  const claimed: (number | undefined)[] = [];
  mocks.importBatch
    .mockReset()
    .mockImplementation(async (_files: File[], options: { generation?: number }) => {
      claimed.push(options.generation);
      return done;
    });
  let release = false;
  const [entry] = await localSaveRegistry.register("eu4", [
    {
      kind: "handle",
      name: "a.eu4",
      file: {
        // Another save opens while the file is read.
        getFile: async () => {
          generation++;
          if (release) session.abort();
          return new File(["a"], "a.eu4");
        },
      } as unknown as FileSystemFileHandle,
    },
  ]);
  const analyze = campaignAnalyzer({
    history,
    analysis: {
      claim: () => {},
      generation: () => generation,
      signal: () => session.signal,
      append: vi.fn(),
    },
    parser: { refuse: () => null, start: vi.fn(), parse: vi.fn(), peakBytes: () => 0 },
  });
  await analyze([entry], "campaign");
  expect(claimed.at(-1)).toBe(1);

  // A release of the session during the read ends the import.
  release = true;
  claimed.length = 0;
  await analyze([entry], "campaign");
  expect(claimed).toEqual([]);
});
