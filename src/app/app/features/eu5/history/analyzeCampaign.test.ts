import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import type { Snapshot } from "./types";
import { useHistory } from "./store";

const mocks = vi.hoisted(() => ({
  cachedSnapshots: vi.fn(),
  importTimeline: vi.fn(),
  getLocalSave: vi.fn(),
  setLocalSaveIdentity: vi.fn(),
}));
vi.mock("./cache", () => ({ cachedSnapshots: mocks.cachedSnapshots }));
vi.mock("./importSnapshots", () => ({ importTimeline: mocks.importTimeline }));
vi.mock("@/features/campaign/localSaves", () => ({
  getLocalSave: mocks.getLocalSave,
  setLocalSaveIdentity: mocks.setLocalSaveIdentity,
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
const observation = (hash = "blake3:abc", campaignId = "campaign") =>
  ({
    hash,
    campaignId,
    version: "1.0.0",
    date: "1360-01-01",
    dateSort: 13600101,
    schemaVersion: 3,
    fileName: file.name,
  }) as Snapshot;
let entries: LocalSaveEntry[];
beforeEach(() => {
  vi.resetAllMocks();
  useHistory.getState().clear();
  useHistory.setState({ progress: null, cancel: null, analysisPaused: false });
  mocks.cachedSnapshots.mockResolvedValue([]);
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
      hash: "blake3:abc",
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
    expect(useHistory.getState().sources.first.hash).toBe("blake3:abc");
    expect(useHistory.getState().sources.copy.hash).toBe("blake3:abc");
    expect(useHistory.getState().snapshots).toHaveLength(1);
  });

  it("preserves successful observations when cancelled and ignores late results", async () => {
    mocks.importTimeline.mockImplementation(async (_files, options) => {
      const snapshot = observation();
      options.onSnapshots([snapshot], [{ snapshot, file }]);
      useHistory.getState().cancel!();
      expect(useHistory.getState().analysisPaused).toBe(true);
      expect(options.signal.aborted).toBe(true);
      options.onSnapshots([observation("late")], [{ snapshot: observation("late"), file }]);
      throw new DOMException("Stopped", "AbortError");
    });
    await analyzeCampaign(entries, "campaign");
    expect(useHistory.getState().snapshots.map((s) => s.hash)).toEqual(["blake3:abc"]);
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

  it("rejects concurrent runs before starting another importer", async () => {
    useHistory.setState({ progress: { completed: 0, total: 1, startedAt: 0 } });
    await expect(analyzeCampaign(entries, "campaign")).rejects.toThrow("already running");
    expect(mocks.importTimeline).not.toHaveBeenCalled();
  });
});
