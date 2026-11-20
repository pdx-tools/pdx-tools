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
  expect(history.getState().analysisPausedCampaigns).toEqual(["campaign"]);
  expect(mocks.importBatch.mock.calls.every(([files]) => files.length === 0)).toBe(true);
});

it("keeps uploads on the session that the import claimed", async () => {
  const history = create<CampaignAnalysisState>()((set) => campaignAnalysisState(set));
  const session = new AbortController();
  let generation = 1;
  const sinks: { generation: () => number }[] = [];
  mocks.importBatch
    .mockReset()
    .mockImplementation(async (_files: File[], _options: unknown, sink: (typeof sinks)[number]) => {
      sinks.push(sink);
      return done;
    });
  const analyze = campaignAnalyzer({
    history,
    analysis: {
      claim: () => {},
      generation: () => generation,
      signal: () => session.signal,
      append: vi.fn(),
      remove: vi.fn(),
    },
    parser: { refuse: () => null, start: vi.fn(), parse: vi.fn(), peakBytes: () => 0 },
    download: async ({ saveId, name }) => {
      // A clear starts another generation while the upload downloads.
      if (saveId === "a") generation = 2;
      return new File([saveId], name);
    },
  });
  await analyze([], "campaign", [{ saveId: "a", name: "a.eu4" }]);
  // The upload batch appends to the claimed generation, which the session refuses.
  expect(sinks.at(-1)!.generation()).toBe(1);

  // A release of the session stops the downloads.
  session.abort();
  const download = vi.fn();
  await campaignAnalyzer({
    history,
    analysis: {
      claim: () => {},
      generation: () => 3,
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

it("keeps local reads on the session that the import claimed", async () => {
  const history = create<CampaignAnalysisState>()((set) => campaignAnalysisState(set));
  const session = new AbortController();
  let generation = 1;
  const sinks: { generation: () => number }[] = [];
  mocks.importBatch
    .mockReset()
    .mockImplementation(async (_files: File[], _options: unknown, sink: (typeof sinks)[number]) => {
      sinks.push(sink);
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
      remove: vi.fn(),
    },
    parser: { refuse: () => null, start: vi.fn(), parse: vi.fn(), peakBytes: () => 0 },
  });
  await analyze([entry], "campaign");
  expect(sinks.at(-1)!.generation()).toBe(1);

  // A release of the session during the read ends the import.
  release = true;
  sinks.length = 0;
  await analyze([entry], "campaign");
  expect(sinks).toEqual([]);
});

it("releases the snapshot of an earlier version of a file", async () => {
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
  })([entry], "campaign");
  expect(remove).toHaveBeenCalledWith(["eu4:1444"]);
  expect(history.getState().snapshots.map((x) => x.id)).toEqual(["eu4:1500"]);
  expect(history.getState().sources[entry.id].snapshotId).toBe("eu4:1500");
});
