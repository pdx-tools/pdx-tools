import { expect, it, vi } from "vitest";
import { create } from "zustand";
import type { SnapshotDescriptor } from "./descriptor";
import type { FileCompletion, ImportOptions } from "./importScheduler";

const mocks = vi.hoisted(() => ({ importBatch: vi.fn() }));
vi.mock("./importScheduler", () => ({
  importBatch: (files: File[], _parser: unknown, _sink: unknown, options: unknown) =>
    mocks.importBatch(files, options),
}));
import { campaignAnalysisState } from "./analysisState";
import type { CampaignAnalysisState } from "./analysisState";
import { campaignAnalyzer } from "./analyzeCampaign";

const descriptor = (id: string, campaignId = "campaign") =>
  ({ id, campaignId, dateSort: 14441111 }) as SnapshotDescriptor;
const done = {
  files: [],
  outcomes: { accepted: 0, duplicate: 0, failed: 0, refused: 0, unprocessed: 0, cancelled: 0 },
  failures: [],
  memoryFull: null,
};

it("downloads uploads a few at a time and tells a failed download from a failed read", async () => {
  const history = create<CampaignAnalysisState>()((set) => campaignAnalysisState(set));
  const download = vi.fn(async (saveId: string) => {
    if (saveId === "lost") throw Error("offline");
    return new Blob([saveId]);
  });
  const batches: string[][] = [];
  mocks.importBatch.mockImplementation(
    async (files: File[], options: ImportOptions<SnapshotDescriptor>) => {
      if (files.length) batches.push(files.map((file) => file.name));
      for (const file of files) {
        const completion: FileCompletion<SnapshotDescriptor> =
          file.name === "broken.eu4"
            ? { status: "failed", file, error: "bad save" }
            : { status: "accepted", file, descriptor: descriptor(`eu4:${file.name}`) };
        options.onFileComplete(completion);
      }
      return done;
    },
  );
  const analyze = campaignAnalyzer({
    history,
    analysis: {
      claim: () => {},
      generation: () => 1,
      signal: () => new AbortController().signal,
      append: vi.fn(),
    },
    parser: { refuse: () => null, start: vi.fn(), parse: vi.fn(), peakBytes: () => 0 },
    download,
  });
  const names = ["a", "b", "lost", "broken", "e"];
  await analyze(
    [],
    "campaign",
    names.map((saveId) => ({ saveId, name: `${saveId}.eu4` })),
  );

  // Four uploads download at a time; a failed download does not reach the parser.
  expect(batches).toEqual([["a.eu4", "b.eu4", "broken.eu4"], ["e.eu4"]]);
  const { uploads, progress, analyzingUploadIds } = history.getState();
  expect(uploads).toEqual({
    a: { kind: "ready", snapshotId: "eu4:a.eu4" },
    b: { kind: "ready", snapshotId: "eu4:b.eu4" },
    lost: { kind: "failed", reason: "download", error: "Error: offline" },
    broken: { kind: "failed", reason: "read", error: "bad save" },
    e: { kind: "ready", snapshotId: "eu4:e.eu4" },
  });
  expect(progress).toBeNull();
  expect(analyzingUploadIds).toEqual([]);
});

it("stops downloads when the player stops the analysis", async () => {
  const history = create<CampaignAnalysisState>()((set) => campaignAnalysisState(set));
  mocks.importBatch.mockReset().mockResolvedValue(done);
  const download = vi.fn(
    (_saveId: string, signal: AbortSignal) =>
      new Promise<Blob>((_, reject) =>
        signal.addEventListener("abort", () => reject(new DOMException("Stopped", "AbortError"))),
      ),
  );
  const analyze = campaignAnalyzer({
    history,
    analysis: {
      claim: () => {},
      generation: () => 1,
      signal: () => new AbortController().signal,
      append: vi.fn(),
    },
    parser: { refuse: () => null, start: vi.fn(), parse: vi.fn(), peakBytes: () => 0 },
    download,
  });
  const running = analyze([], "campaign", [{ saveId: "a", name: "a.eu4" }]);
  await vi.waitFor(() => expect(download).toHaveBeenCalledOnce());
  history.getState().cancel!();
  await running;
  expect(history.getState().uploads).toEqual({});
  expect(history.getState().analysisPausedCampaigns).toEqual(["campaign"]);
  expect(mocks.importBatch.mock.calls.every(([files]) => files.length === 0)).toBe(true);
});
