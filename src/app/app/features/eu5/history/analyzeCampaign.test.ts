import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import type { SnapshotMetadata as Snapshot } from "./types";
import { isAnalysisPaused, useHistory } from "./store";

const mocks = vi.hoisted(() => ({
  importTimeline: vi.fn(),
  getLocalSave: vi.fn(),
  setLocalSaveIdentity: vi.fn(),
}));
vi.mock("./importSnapshots", () => ({ importTimeline: mocks.importTimeline }));
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
const observation = (hash = "eu5:abc", campaignId = "campaign") =>
  ({
    hash,
    campaignId,
    version: "1.0.0",
    date: "1360-01-01",
    dateSort: 13600101,

    fileName: file.name,
  }) as Snapshot;
let entries: LocalSaveEntry[];
beforeEach(() => {
  vi.resetAllMocks();
  useHistory.setState({
    snapshots: [],
    sources: {},
    issues: [],
    progress: null,
    cancel: null,
    analysisPaused: false,
    analysisPausedCampaigns: [],
  });
  entries = [entry("first")];
  mocks.getLocalSave.mockImplementation((id) => entries.find((item) => item.id === id));
  mocks.importTimeline.mockResolvedValue({ errors: [] });
});

describe("campaign analysis", () => {
  it("attaches observations to campaign entries without owning navigation state", async () => {
    mocks.importTimeline.mockImplementation(async (_files, options) => {
      const snapshot = observation();
      options.onSnapshots([snapshot], [{ snapshot, file }]);
      return { errors: [] };
    });
    await analyzeCampaign(entries, "campaign");
    expect(useHistory.getState().sources.first).toEqual({
      hash: "eu5:abc",
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

  it("excludes another campaign from charts and reports it to the user", async () => {
    mocks.importTimeline.mockImplementation(async (_files, options) => {
      const snapshot = observation("other", "different");
      options.onSnapshots([snapshot], [{ snapshot, file }]);
      return { errors: [] };
    });
    await analyzeCampaign(entries, "campaign");
    expect(useHistory.getState().snapshots).toEqual([]);
    expect(useHistory.getState().issues[0]).toContain("another campaign");
    expect(mocks.setLocalSaveIdentity.mock.calls[0][1].playthroughId).toBe("different");
  });

  it("reports failed saves without blocking new files and keeps successful observations", async () => {
    const good = new File(["good"], "good.eu5", { lastModified: 101 });
    const bad = new File(["bad"], "bad.eu5", { lastModified: 102 });
    entries = [
      { ...entry("good", { kind: "file", file: good }), name: good.name },
      { ...entry("bad", { kind: "file", file: bad }), name: bad.name },
    ];
    useHistory.setState({ analysisPausedCampaigns: ["other-campaign"] });
    mocks.importTimeline.mockImplementation(async (_files, options) => {
      const snapshot = observation("good-observation");
      options.onSnapshots([snapshot], [{ snapshot, file: good }]);
      return { errors: [{ fileName: bad.name, error: "invalid date" }] };
    });

    await analyzeCampaign(entries, "campaign");

    expect(useHistory.getState().analysisPaused).toBe(false);
    expect(useHistory.getState().analysisPausedCampaigns).toEqual(["other-campaign"]);
    expect(isAnalysisPaused(useHistory.getState(), "campaign")).toBe(false);
    expect(useHistory.getState().snapshots.map(({ hash }) => hash)).toEqual(["good-observation"]);
    expect(useHistory.getState().sources.good.hash).toBe("good-observation");
    expect(useHistory.getState().issues).toEqual(["bad.eu5: invalid date"]);

    const added = entry("added", {
      kind: "file",
      file: new File(["new save"], "added.eu5"),
    });
    entries.push(added);
    mocks.importTimeline.mockResolvedValue({ errors: [] });
    await analyzeCampaign([added], "campaign");
    expect(mocks.importTimeline.mock.calls[1][0]).toEqual([added.ref.file]);
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
      handle: { hash: "old", version: { size: file.size, lastModified: 100 } },
    });
    mocks.importTimeline.mockImplementation(async (files, options) => {
      expect(files).toEqual([newer]);
      const snapshot = { ...observation("new"), dateSort: 13600401 };
      options.onSnapshots([snapshot], [{ snapshot, file: newer }]);
      return { errors: [] };
    });
    await analyzeCampaign(entries, "campaign");
    expect(getFile).toHaveBeenCalledOnce();
    expect(useHistory.getState().sources.handle.hash).toBe("new");
    expect(useHistory.getState().snapshots.map((s) => s.hash)).toEqual(["old", "new"]);
  });

  it("retains individual associations for duplicate byte-identical files", async () => {
    const duplicate = new File(["save"], "copy.eu5", { lastModified: 100 });
    entries = [entry("first"), entry("copy", { kind: "file", file: duplicate })];
    mocks.importTimeline.mockImplementation(async (_files, options) => {
      const snapshot = observation();
      options.onSnapshots(
        [snapshot, snapshot],
        [
          { snapshot, file },
          { snapshot, file: duplicate },
        ],
      );
      return { errors: [] };
    });
    await analyzeCampaign(entries, "campaign");
    expect(useHistory.getState().sources.first.hash).toBe("eu5:abc");
    expect(useHistory.getState().sources.copy.hash).toBe("eu5:abc");
    expect(useHistory.getState().snapshots).toHaveLength(1);
  });

  it("preserves observations committed before or during cancellation", async () => {
    mocks.importTimeline.mockImplementation(async (_files, options) => {
      const snapshot = observation();
      options.onSnapshots([snapshot], [{ snapshot, file }]);
      useHistory.getState().cancel!();
      expect(useHistory.getState().analysisPausedCampaigns).toEqual(["campaign"]);
      expect(options.signal.aborted).toBe(true);
      options.onSnapshots([observation("late")], [{ snapshot: observation("late"), file }]);
      throw new DOMException("Stopped", "AbortError");
    });
    await analyzeCampaign(entries, "campaign");
    expect(useHistory.getState().snapshots.map((s) => s.hash)).toEqual(["eu5:abc", "late"]);
    expect(useHistory.getState().analysisPausedCampaigns).toEqual(["campaign"]);
    expect(useHistory.getState().progress).toBeNull();
    expect(useHistory.getState().issues).toEqual([]);
  });

  it("does not attach results to an entry replaced while parsing", async () => {
    mocks.importTimeline.mockImplementation(async (_files, options) => {
      entries = [entry("first", { kind: "file", file: new File(["replacement"], file.name) })];
      const snapshot = observation();
      options.onSnapshots([snapshot], [{ snapshot, file }]);
      return { errors: [{ fileName: "failed.eu5", error: "missing morale" }] };
    });
    await analyzeCampaign(entries, "campaign");
    expect(useHistory.getState().sources).toEqual({});
    expect(mocks.setLocalSaveIdentity).not.toHaveBeenCalled();
    expect(useHistory.getState().issues).toEqual(["failed.eu5: missing morale"]);
  });

  it("does not overwrite metadata for a newer handle version read by navigation", async () => {
    mocks.importTimeline.mockImplementation(async (_files, options) => {
      entries = [{ ...entry("first"), version: { size: 99, lastModified: 200 } }];
      const snapshot = observation();
      options.onSnapshots([snapshot], [{ snapshot, file }]);
      return { errors: [] };
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
    mocks.importTimeline.mockImplementation(async (files, options) => {
      expect(files).toEqual([file]);
      expect(useHistory.getState().progress?.total).toBe(2);
      options.onProgress(1, 1, file.name);
      expect(useHistory.getState().progress).toMatchObject({ completed: 2, total: 2 });
      return { errors: [] };
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
    expect(mocks.importTimeline).not.toHaveBeenCalled();
  });

  it("resumes the current campaign without resuming another paused campaign", async () => {
    useHistory.setState({ analysisPausedCampaigns: ["campaign", "other"] });
    mocks.importTimeline.mockResolvedValue({ errors: [] });
    await analyzeCampaign(entries, "campaign");
    expect(useHistory.getState().analysisPausedCampaigns).toEqual(["other"]);
  });

  it("rejects concurrent runs before starting another importer", async () => {
    useHistory.setState({ progress: { completed: 0, total: 1, startedAt: 0 } });
    await expect(analyzeCampaign(entries, "campaign")).rejects.toThrow("already running");
    expect(mocks.importTimeline).not.toHaveBeenCalled();
  });
});

it("identifies active saves by their file reference and clears the UI state on cancellation", async () => {
  const other = new File(["different save"], file.name, { lastModified: 200 });
  entries.push(entry("second", { kind: "file", file: other }));
  mocks.importTimeline.mockImplementation(async (_files, options) => {
    options.onActiveFiles([file]);
    expect(useHistory.getState().analyzingEntryIds).toEqual(["first"]);
    options.onActiveFiles([file, other]);
    expect(useHistory.getState().analyzingEntryIds).toEqual(["first", "second"]);
    useHistory.getState().cancel!();
    options.onActiveFiles([other]);
    throw new DOMException("Cancelled", "AbortError");
  });
  await analyzeCampaign(entries, "campaign");
  expect(useHistory.getState().analyzingEntryIds).toEqual([]);
});
