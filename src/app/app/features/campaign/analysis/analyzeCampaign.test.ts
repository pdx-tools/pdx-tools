import { expect, it, vi } from "vitest";
import { create } from "zustand";
import type { SnapshotDescriptor } from "./descriptor";
import type { FileCompletion, ImportOptions } from "./importScheduler";

const mocks = vi.hoisted(() => ({ importBatch: vi.fn() }));
vi.mock("./importScheduler", () => ({
  importBatch: (files: File[], _parser: unknown, sink: unknown, options: unknown) =>
    mocks.importBatch(files, options, sink),
}));
import { analysisAdmission } from "./admission";
import { campaignAnalysisState } from "./analysisState";
import type { CampaignAnalysisState } from "./analysisState";
import { campaignAnalyzer } from "./analyzeCampaign";
import { localSaveRegistry } from "@/features/campaign/localSaves";

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
  const download = vi.fn(async ({ saveId, name }: { saveId: string; name: string }) => {
    if (saveId === "lost") throw Error("offline");
    return new File([saveId], name);
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
      remove: vi.fn(),
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
    (_upload: unknown, signal: AbortSignal) =>
      new Promise<File>((_, reject) =>
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
      remove: vi.fn(),
    },
    parser: { refuse: () => null, start: vi.fn(), parse: vi.fn(), peakBytes: () => 0 },
    download,
  });
  const running = analyze([], "campaign", [{ saveId: "a", name: "a.eu4" }]);
  await vi.waitFor(() => expect(download).toHaveBeenCalledOnce());
  history.getState().cancel!();
  await running;
  expect(history.getState().uploads).toEqual({});
  expect(Object.keys(history.getState().pausedCampaigns)).toEqual(["campaign"]);
  expect(mocks.importBatch.mock.calls.every(([files]) => files.length === 0)).toBe(true);
});

it("stops downloads once another claim releases the session", async () => {
  const history = create<CampaignAnalysisState>()((set) => campaignAnalysisState(set));
  const session = new AbortController();
  session.abort();
  mocks.importBatch.mockReset().mockResolvedValue(done);
  const download = vi.fn();
  await campaignAnalyzer({
    history,
    analysis: {
      claim: () => {},
      generation: () => 1,
      signal: () => session.signal,
      append: vi.fn(),
      remove: vi.fn(),
    },
    parser: { refuse: () => null, start: vi.fn(), parse: vi.fn(), peakBytes: () => 0 },
    download,
  })([], "campaign", [{ saveId: "b", name: "b.eu4" }]);
  expect(download).not.toHaveBeenCalled();
});

it("releases replaced snapshots under the import lease", async () => {
  const history = create<CampaignAnalysisState>()((set) => campaignAnalysisState(set));
  history.getState().add([descriptor("eu4:old")], {}, { up: "eu4:old" });
  mocks.importBatch.mockReset().mockResolvedValue(done);
  let busy = false;
  const remove = vi.fn(async () => {
    // Another import cannot start while this one releases snapshots.
    busy = (() => {
      try {
        analysisAdmission().acquireImport().release();
        return false;
      } catch {
        return true;
      }
    })();
  });
  await campaignAnalyzer({
    history,
    analysis: {
      claim: () => {},
      generation: () => 1,
      signal: () => new AbortController().signal,
      append: vi.fn(),
      remove,
    },
    parser: { refuse: () => null, start: vi.fn(), parse: vi.fn(), peakBytes: () => 0 },
  })([], "campaign", [], ["eu4:old"]).catch(() => {});
  expect(remove).toHaveBeenCalledWith(["eu4:old"]);
  expect(busy).toBe(true);
  expect(history.getState().snapshots).toEqual([]);
  expect(history.getState().uploads).toEqual({});
});

it("ends an import when another claim releases the session while files are read", async () => {
  const history = create<CampaignAnalysisState>()((set) => campaignAnalysisState(set));
  const session = new AbortController();
  mocks.importBatch.mockReset().mockResolvedValue(done);
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
      remove: vi.fn(),
    },
    parser: { refuse: () => null, start: vi.fn(), parse: vi.fn(), peakBytes: () => 0 },
  });
  await analyze([entry], "campaign");
  expect(mocks.importBatch).not.toHaveBeenCalled();
  expect(history.getState().progress).toBeNull();
});

it.each([true, false])(
  "releases the snapshot of an earlier version of a file when asked: %s",
  async (releaseEarlierVersions) => {
    const history = create<CampaignAnalysisState>()((set) => campaignAnalysisState(set));
    const file = new File(["1500"], "autosave.eu4", { lastModified: 2 });
    const [entry] = await localSaveRegistry.register("eu4", [{ kind: "file", file }]);
    // The snapshot of the file when it held an earlier date.
    history.getState().add([descriptor("eu4:1444")], {
      [entry.id]: { snapshotId: "eu4:1444", version: { size: 4, lastModified: 1 } },
    });
    mocks.importBatch
      .mockReset()
      .mockImplementation(async (files: File[], options: ImportOptions<SnapshotDescriptor>) => {
        for (const file of files)
          options.onFileComplete({ status: "accepted", file, descriptor: descriptor("eu4:1500") });
        return done;
      });
    const remove = vi.fn(async () => {});
    await campaignAnalyzer({
      history,
      analysis: {
        claim: () => {},
        generation: () => 1,
        signal: () => new AbortController().signal,
        append: vi.fn(),
        remove,
      },
      parser: { refuse: () => null, start: vi.fn(), parse: vi.fn(), peakBytes: () => 0 },
      releaseEarlierVersions,
    })([entry], "campaign");
    expect(history.getState().sources[entry.id].snapshotId).toBe("eu4:1500");
    // A game that shows every snapshot, such as EU5's map history, keeps it.
    if (!releaseEarlierVersions) {
      expect(remove).not.toHaveBeenCalled();
      expect(history.getState().snapshots).toHaveLength(2);
      return;
    }
    expect(remove).toHaveBeenCalledWith(["eu4:1444"]);
    expect(history.getState().snapshots.map((x) => x.id)).toEqual(["eu4:1500"]);
  },
);

it("keeps a point that this browser keeps when its file moves on", async () => {
  const history = create<CampaignAnalysisState>()((set) => campaignAnalysisState(set));
  const file = new File(["1510"], "autosave.eu4", { lastModified: 2 });
  const [entry] = await localSaveRegistry.register("eu4", [{ kind: "file", file }]);
  // The browser kept 1500 from an earlier visit, and the file held it when it opened.
  history.getState().add([descriptor("eu4:1500")], {
    [entry.id]: { snapshotId: "eu4:1500", version: { size: 4, lastModified: 1 } },
  });
  history.setState((x) => ({
    points: { "eu4:1500": { ...x.points["eu4:1500"], kept: true } },
  }));
  mocks.importBatch
    .mockReset()
    .mockImplementation(async (files: File[], options: ImportOptions<SnapshotDescriptor>) => {
      for (const file of files)
        options.onFileComplete({ status: "accepted", file, descriptor: descriptor("eu4:1510") });
      return done;
    });
  const remove = vi.fn(async () => {});
  await campaignAnalyzer({
    history,
    analysis: {
      claim: () => {},
      generation: () => 1,
      signal: () => new AbortController().signal,
      append: vi.fn(),
      remove,
    },
    parser: { refuse: () => null, start: vi.fn(), parse: vi.fn(), peakBytes: () => 0 },
    releaseEarlierVersions: true,
  })([entry], "campaign");
  expect(remove).not.toHaveBeenCalled();
  expect(history.getState().snapshots.map((x) => x.id)).toEqual(["eu4:1500", "eu4:1510"]);
});
