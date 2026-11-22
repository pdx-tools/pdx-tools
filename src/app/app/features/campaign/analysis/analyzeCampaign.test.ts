import { expect, it, vi } from "vitest";
import { create } from "zustand";

const mocks = vi.hoisted(() => ({ importBatch: vi.fn() }));
vi.mock("./importScheduler", () => ({
  importBatch: (...args: unknown[]) => mocks.importBatch(...args),
}));
import { campaignAnalysisState } from "./analysisState";
import type { CampaignAnalysisState } from "./analysisState";
import { campaignAnalyzer } from "./analyzeCampaign";
import { localSaveRegistry } from "@/features/campaign/localSaves";

it("ends an import when another claim releases the session while files are read", async () => {
  const history = create<CampaignAnalysisState>()((set) => campaignAnalysisState(set));
  const session = new AbortController();
  const [entry] = await localSaveRegistry.register("eu4", [
    {
      kind: "handle",
      name: "a.eu4",
      file: {
        // Another save opens while the file is read.
        getFile: async () => {
          session.abort();
          return new File(["a"], "a.eu4");
        },
      } as unknown as FileSystemFileHandle,
    },
  ]);
  const analyze = campaignAnalyzer({
    history,
    analysis: {
      claim: () => {},
      generation: () => 1,
      signal: () => session.signal,
      append: vi.fn(),
    },
    parser: { refuse: () => null, start: vi.fn(), parse: vi.fn(), peakBytes: () => 0 },
  });
  await analyze([entry], "campaign");
  expect(mocks.importBatch).not.toHaveBeenCalled();
  expect(history.getState().progress).toBeNull();
});
