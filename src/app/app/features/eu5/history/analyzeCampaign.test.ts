import { beforeEach, describe, expect, it, vi } from "vitest";
import { analysisAdmission } from "@/features/campaign/analysis/admission";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import type { Eu5SnapshotDescriptor as Snapshot } from "./analysisTypes";
import { isAnalysisPaused, useHistory } from "./store";

const mocks = vi.hoisted(() => ({
  importBatch: vi.fn(),
  getLocalSave: vi.fn(),
  setLocalSaveIdentity: vi.fn(),
}));
vi.mock("@/features/campaign/analysis/importScheduler", () => ({
  importBatch: (files: File[], _parser: unknown, _sink: unknown, options: unknown) =>
    mocks.importBatch(files, options),
}));
vi.mock("./analysisClient", () => ({ eu5Analysis: { claim: () => {} } }));
vi.mock("@/features/campaign/localSaves", () => ({
  localSaveRegistry: { get: mocks.getLocalSave, recordIdentity: mocks.setLocalSaveIdentity },
  fileVersion: (file: File) => ({ size: file.size, lastModified: file.lastModified }),
  sameFileVersion: (file: File, version: { size: number; lastModified: number }) =>
    file.size === version.size && file.lastModified === version.lastModified,
  holdsRef: (entry: LocalSaveEntry, ref: LocalSaveEntry["ref"]) =>
    entry.ref.kind === ref.kind && entry.ref.file === ref.file,
}));
import { analyzeCampaign } from "./analyzeCampaign";

const file = new File(["save"], "observer.eu5", { lastModified: 100 });
const entry = (
  id: string,
  ref: LocalSaveEntry["ref"] = { kind: "file", file },
): LocalSaveEntry => ({
  id,
  game: "eu5",
  ref,
  name: "observer.eu5",
  identity: null,
  version: null,
  problem: null,
  batch: 1,
});
const observation = (id = "eu5:abc", campaignId = "campaign") =>
  ({
    id,
    campaignId,
    gameVersion: "1.0.0",
    date: "1360-01-01",
    dateSort: 13600101,
  }) as Snapshot;
let entries: LocalSaveEntry[];
const done = () => ({
  files: [],
  outcomes: { accepted: 0, duplicate: 0, failed: 0, refused: 0, unprocessed: 0, cancelled: 0 },
  failures: [] as { fileName: string; error: string }[],
  memoryFull: null as string | null,
});
beforeEach(() => {
  vi.resetAllMocks();
  useHistory.setState({
    snapshots: [],
    sources: {},
    failedSources: {},
    issues: [],
    progress: null,
    cancel: null,
    analysisPausedCampaigns: [],
  });
  entries = [entry("first")];
  mocks.getLocalSave.mockImplementation((id) => entries.find((item) => item.id === id));
  mocks.importBatch.mockResolvedValue(done());
});

describe("campaign analysis", () => {
  it("says why the store refused saves and pauses the campaign", async () => {
    mocks.importBatch.mockResolvedValue({
      ...done(),
      outcomes: { ...done().outcomes, refused: 1, unprocessed: 1 },
      memoryFull: "Campaign analysis is full.",
    });
    await analyzeCampaign(entries, "campaign");
    const state = useHistory.getState();
    expect(state.issues).toContain(
      "Campaign analysis is full. 2 saves were not analyzed. Clear the campaign analysis to analyze other saves.",
    );
    expect(isAnalysisPaused(state, "campaign")).toBe(true);
  });

  it("attaches observations to campaign entries without owning navigation state", async () => {
    mocks.importBatch.mockImplementation(async (_files, options) => {
      const snapshot = observation();
      options.onFileComplete({ status: "accepted", file, descriptor: snapshot });
      return done();
    });
    await analyzeCampaign(entries, "campaign");
    expect(useHistory.getState().sources.first).toEqual({
      snapshotId: "eu5:abc",
      version: { size: file.size, lastModified: 100 },
    });
    expect(useHistory.getState().snapshots).toHaveLength(1);
    expect(mocks.setLocalSaveIdentity).toHaveBeenCalledWith(
      "first",
      { playthroughId: "campaign", campaignIdHint: null, date: { year: 1360, month: 1, day: 1 } },
      { size: file.size, lastModified: 100 },
    );
    expect(useHistory.getState()).not.toHaveProperty("selectedHash");
    expect(useHistory.getState()).not.toHaveProperty("files");
  });

  it("refuses a save of another campaign before the store keeps it, and reports it", async () => {
    let reason: string | null = null;
    mocks.importBatch.mockImplementation(async (_files, options) => {
      reason = options.refuseOutput({ descriptor: observation("other", "different") }, file);
      return { ...done(), failures: [{ fileName: file.name, error: reason }] };
    });
    await analyzeCampaign(entries, "campaign");
    expect(useHistory.getState().snapshots).toEqual([]);
    expect(reason).toContain("another campaign");
    expect(useHistory.getState().issues[0]).toContain("another campaign");
    expect(mocks.setLocalSaveIdentity.mock.calls[0][1].playthroughId).toBe("different");
  });

  it("does not mark a save of another campaign as failed", async () => {
    useHistory.setState({ failedSources: { first: { version: null, error: "old failure" } } });
    mocks.importBatch.mockImplementation(async (_files, options) => {
      const reason = options.refuseOutput({ descriptor: observation("other", "different") }, file);
      options.onFileComplete({ status: "failed", file, error: reason });
      return { ...done(), failures: [{ fileName: file.name, error: reason }] };
    });
    await analyzeCampaign(entries, "campaign");
    expect(useHistory.getState().failedSources).toEqual({});
  });

  it("reports failed saves without blocking new files and keeps successful observations", async () => {
    const good = new File(["good"], "good.eu5", { lastModified: 101 });
    const bad = new File(["bad"], "bad.eu5", { lastModified: 102 });
    entries = [
      { ...entry("good", { kind: "file", file: good }), name: good.name },
      { ...entry("bad", { kind: "file", file: bad }), name: bad.name },
    ];
    useHistory.setState({ analysisPausedCampaigns: ["other-campaign"] });
    mocks.importBatch.mockImplementation(async (_files, options) => {
      const snapshot = observation("good-observation");
      options.onFileComplete({ status: "accepted", file: good, descriptor: snapshot });
      return { ...done(), failures: [{ fileName: bad.name, error: "invalid date" }] };
    });

    await analyzeCampaign(entries, "campaign");

    expect(useHistory.getState().analysisPausedCampaigns).toEqual(["other-campaign"]);
    expect(isAnalysisPaused(useHistory.getState(), "campaign")).toBe(false);
    expect(useHistory.getState().snapshots.map(({ id }) => id)).toEqual(["good-observation"]);
    expect(useHistory.getState().sources.good.snapshotId).toBe("good-observation");
    expect(useHistory.getState().issues).toEqual(["bad.eu5: invalid date"]);

    const added = entry("added", {
      kind: "file",
      file: new File(["new save"], "added.eu5"),
    });
    entries.push(added);
    mocks.importBatch.mockResolvedValue(done());
    await analyzeCampaign([added], "campaign");
    expect(mocks.importBatch.mock.calls[1][0]).toEqual([added.ref.file]);
    expect(useHistory.getState().analysisPausedCampaigns).toEqual(["other-campaign"]);
  });

  it("keeps another campaign paused when a new campaign analysis starts", async () => {
    useHistory.setState({ analysisPausedCampaigns: ["paused-campaign"] });

    await analyzeCampaign(entries, "new-campaign");

    expect(useHistory.getState().analysisPausedCampaigns).toEqual(["paused-campaign"]);
  });

  it("re-reads a file handle and keeps its new content separate from the old observation", async () => {
    const newer = new File(["newer save"], "observer.eu5", { lastModified: 200 });
    const getFile = vi.fn().mockResolvedValue(newer);
    entries = [
      entry("handle", {
        kind: "handle",
        file: { getFile } as unknown as FileSystemFileHandle,
        name: file.name,
      }),
    ];
    useHistory.getState().add([observation("old")], {
      handle: { snapshotId: "old", version: { size: file.size, lastModified: 100 } },
    });
    mocks.importBatch.mockImplementation(async (files, options) => {
      expect(files).toEqual([newer]);
      const snapshot = { ...observation("new"), dateSort: 13600401 };
      options.onFileComplete({ status: "accepted", file: newer, descriptor: snapshot });
      return done();
    });
    await analyzeCampaign(entries, "campaign");
    expect(getFile).toHaveBeenCalledOnce();
    expect(useHistory.getState().sources.handle.snapshotId).toBe("new");
    expect(useHistory.getState().snapshots.map((s) => s.id)).toEqual(["old", "new"]);
  });

  it("retains individual associations for duplicate byte-identical files", async () => {
    const duplicate = new File(["save"], "copy.eu5", { lastModified: 100 });
    entries = [entry("first"), entry("copy", { kind: "file", file: duplicate })];
    mocks.importBatch.mockImplementation(async (_files, options) => {
      const snapshot = observation();
      options.onFileComplete({ status: "accepted", file, descriptor: snapshot });
      options.onFileComplete({ status: "accepted", file: duplicate, descriptor: snapshot });
      return done();
    });
    await analyzeCampaign(entries, "campaign");
    expect(useHistory.getState().sources.first.snapshotId).toBe("eu5:abc");
    expect(useHistory.getState().sources.copy.snapshotId).toBe("eu5:abc");
    expect(useHistory.getState().snapshots).toHaveLength(1);
  });

  it("preserves observations committed before or during cancellation", async () => {
    mocks.importBatch.mockImplementation(async (_files, options) => {
      const snapshot = observation();
      options.onFileComplete({ status: "accepted", file, descriptor: snapshot });
      useHistory.getState().cancel!();
      expect(useHistory.getState().analysisPausedCampaigns).toEqual(["campaign"]);
      expect(options.signal.aborted).toBe(true);
      options.onFileComplete({ status: "accepted", file, descriptor: observation("late") });
      return done();
    });
    await analyzeCampaign(entries, "campaign");
    expect(useHistory.getState().snapshots.map((s) => s.id)).toEqual(["eu5:abc", "late"]);
    expect(useHistory.getState().analysisPausedCampaigns).toEqual(["campaign"]);
    expect(useHistory.getState().progress).toBeNull();
    expect(useHistory.getState().issues).toEqual([]);
  });

  it("does not attach results to an entry replaced while parsing", async () => {
    mocks.importBatch.mockImplementation(async (_files, options) => {
      entries = [entry("first", { kind: "file", file: new File(["replacement"], file.name) })];
      const snapshot = observation();
      options.onFileComplete({ status: "accepted", file, descriptor: snapshot });
      return { ...done(), failures: [{ fileName: "failed.eu5", error: "missing morale" }] };
    });
    await analyzeCampaign(entries, "campaign");
    expect(useHistory.getState().sources).toEqual({});
    expect(mocks.setLocalSaveIdentity).not.toHaveBeenCalled();
    expect(useHistory.getState().issues).toEqual(["failed.eu5: missing morale"]);
  });

  it("does not overwrite metadata for a newer handle version read by navigation", async () => {
    mocks.importBatch.mockImplementation(async (_files, options) => {
      entries = [{ ...entry("first"), version: { size: 99, lastModified: 200 } }];
      const snapshot = observation();
      options.onFileComplete({ status: "accepted", file, descriptor: snapshot });
      return done();
    });
    await analyzeCampaign(entries, "campaign");
    expect(mocks.setLocalSaveIdentity).not.toHaveBeenCalled();
    expect(useHistory.getState().sources).toEqual({});
    expect(useHistory.getState().snapshots).toHaveLength(1);
  });

  it("counts unavailable files once in single-pass import progress", async () => {
    const missing = {
      kind: "handle",
      file: { getFile: vi.fn().mockRejectedValue(new Error("Missing file")) },
      name: "missing.eu5",
    } as unknown as LocalSaveEntry["ref"];
    entries = [entry("first"), entry("missing", missing)];
    mocks.importBatch.mockImplementation(async (files, options) => {
      expect(files).toEqual([file]);
      expect(useHistory.getState().progress?.total).toBe(2);
      options.onProgress({ completed: 1, total: 1, fileName: file.name, active: 1 });
      expect(useHistory.getState().progress).toMatchObject({ completed: 2, total: 2 });
      return done();
    });
    await analyzeCampaign(entries, "campaign");
    expect(useHistory.getState().issues).toContain("observer.eu5: Error: Missing file");
    expect(useHistory.getState().analysisPausedCampaigns).toEqual([]);
  });

  it("cancels while a file handle read remains pending", async () => {
    const getFile = vi.fn(() => new Promise<File>(() => {}));
    const ref = {
      kind: "handle",
      file: { getFile },
      name: "pending.eu5",
    } as unknown as LocalSaveEntry["ref"];
    entries = [entry("pending", ref)];
    const analysis = analyzeCampaign(entries, "campaign");
    await vi.waitFor(() => expect(getFile).toHaveBeenCalledOnce());
    useHistory.getState().cancel!();
    await analysis;
    expect(useHistory.getState().progress).toBeNull();
    expect(useHistory.getState().issues).toEqual([]);
    expect(useHistory.getState().analysisPausedCampaigns).toEqual(["campaign"]);
    expect(mocks.importBatch).not.toHaveBeenCalled();
  });

  it("resumes the current campaign without resuming another paused campaign", async () => {
    useHistory.setState({ analysisPausedCampaigns: ["campaign", "other"] });
    mocks.importBatch.mockResolvedValue(done());
    await analyzeCampaign(entries, "campaign");
    expect(useHistory.getState().analysisPausedCampaigns).toEqual(["other"]);
  });

  it("rejects concurrent runs before starting another importer", async () => {
    const lease = analysisAdmission().acquireImport();
    try {
      await expect(analyzeCampaign(entries, "campaign")).rejects.toThrow("already running");
      expect(mocks.importBatch).not.toHaveBeenCalled();
      expect(useHistory.getState().progress).toBeNull();
    } finally {
      lease.release();
    }
  });

  it("releases the import lease after the batch, also after a failure", async () => {
    mocks.importBatch.mockRejectedValueOnce(Error("broken"));
    await analyzeCampaign(entries, "campaign");
    analysisAdmission().acquireImport().release();
  });
});

it("identifies active saves by their file reference and clears the UI state on cancellation", async () => {
  const other = new File(["different save"], file.name, { lastModified: 200 });
  entries.push(entry("second", { kind: "file", file: other }));
  mocks.importBatch.mockImplementation(async (_files, options) => {
    options.onActiveFiles([file]);
    expect(useHistory.getState().analyzingEntryIds).toEqual(["first"]);
    options.onActiveFiles([file, other]);
    expect(useHistory.getState().analyzingEntryIds).toEqual(["first", "second"]);
    useHistory.getState().cancel!();
    options.onActiveFiles([other]);
    return done();
  });
  await analyzeCampaign(entries, "campaign");
  expect(useHistory.getState().analyzingEntryIds).toEqual([]);
});

it("tracks a parse failure by file identity and clears it on a successful retry", async () => {
  mocks.importBatch.mockImplementation(async (_files, options) => {
    options.onFileComplete({ status: "failed", file, error: "invalid save" });
    return { ...done(), failures: [{ fileName: file.name, error: "invalid save" }] };
  });
  await analyzeCampaign(entries, "campaign");
  expect(useHistory.getState().failedSources.first).toEqual({
    version: { size: file.size, lastModified: 100 },
    error: "invalid save",
  });
  mocks.importBatch.mockImplementation(async (_files, options) => {
    options.onFileComplete({ status: "accepted", file, descriptor: observation() });
    return done();
  });
  await analyzeCampaign(entries, "campaign");
  expect(useHistory.getState().failedSources).toEqual({});
});
it("does not mark an entry replaced during a failed parse as failed", async () => {
  mocks.importBatch.mockImplementation(async (_files, options) => {
    entries = [entry("first", { kind: "file", file: new File(["replacement"], file.name) })];
    options.onFileComplete({ status: "failed", file, error: "old file failed" });
    return { ...done(), failures: [{ fileName: file.name, error: "old file failed" }] };
  });
  await analyzeCampaign(entries, "campaign");
  expect(useHistory.getState().failedSources).toEqual({});
});
it("does not mark an aborted import as failed", async () => {
  mocks.importBatch.mockImplementation(async () => {
    useHistory.getState().cancel!();
    throw new DOMException("Stopped", "AbortError");
  });
  await analyzeCampaign(entries, "campaign");
  expect(useHistory.getState().failedSources).toEqual({});
});
it("marks only failed files, not refused or cancelled ones", async () => {
  mocks.importBatch.mockImplementation(async (_files, options) => {
    options.onFileComplete({ status: "refused", file });
    options.onFileComplete({ status: "cancelled", file });
    return done();
  });
  await analyzeCampaign(entries, "campaign");
  expect(useHistory.getState().failedSources).toEqual({});
});
it("marks an entry whose file cannot be read as failed", async () => {
  const handle = { getFile: () => Promise.reject(Error("file was moved")) };
  entries = [entry("first", { kind: "handle", file: handle } as unknown as LocalSaveEntry["ref"])];
  await analyzeCampaign(entries, "campaign");
  expect(useHistory.getState().failedSources.first).toEqual({
    version: null,
    error: "Error: file was moved",
  });
});
