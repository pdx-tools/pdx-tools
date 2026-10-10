import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHistory } from "./store";
import type { Snapshot } from "./types";

const mocks = vi.hoisted(() => ({ cachedSnapshots: vi.fn(), importTimeline: vi.fn() }));
vi.mock("./cache", () => ({ cachedSnapshots: mocks.cachedSnapshots }));
vi.mock("./importSnapshots", () => ({ importTimeline: mocks.importTimeline }));
import { importEu5Batch } from "./importEu5Batch";

const observation = (hash: string, dateSort: number) =>
  ({
    hash,
    dateSort,
    schemaVersion: 3,
    fileName: `${hash}.eu5`,
  }) as Snapshot;
const early = new File(["early"], "early.eu5");
const late = new File(["late"], "late.EU5");

beforeEach(() => {
  vi.resetAllMocks();
  useHistory.getState().clear();
  useHistory.setState({
    panelOpen: false,
    insightOpen: false,
    batchImportProgress: null,
    cancelBatchImport: null,
    batchImportIssues: [],
  });
  mocks.cachedSnapshots.mockResolvedValue([]);
});

describe("home-page EU5 batch imports", () => {
  it("filters folder contents, retains all saves and opens the earliest imported date", async () => {
    mocks.importTimeline.mockImplementation(async (_files, options) => {
      options.onSnapshots([observation("late", 13600401), observation("early", 13600101)], {
        early,
        late,
      });
      return { errors: [] };
    });
    const result = await importEu5Batch(
      [late, new File(["notes"], "notes.txt"), early],
      new AbortController(),
      vi.fn(),
    );
    expect(mocks.importTimeline.mock.calls[0][0]).toEqual([late, early]);
    expect(result.file).toBe(early);
    const state = useHistory.getState();
    expect(state.snapshots.map((s) => s.hash)).toEqual(["early", "late"]);
    expect(state.files.late).toBe(late);
    expect(state.selectedHash).toBe("early");
    expect(state.panelOpen).toBe(true);
    expect(state.insightOpen).toBe(true);
  });

  it("preserves import notices while opening successful saves", async () => {
    mocks.importTimeline.mockImplementation(async (_files, options) => {
      options.onWarning("Cache could not be written");
      options.onSnapshots([observation("early", 13600101)], { early });
      return { errors: [{ fileName: late.name, error: "missing field morale" }] };
    });
    const result = await importEu5Batch([late, early], new AbortController(), vi.fn());
    expect(result.file).toBe(early);
    expect(result.issues).toEqual(["Cache could not be written", "late.EU5: missing field morale"]);
  });

  it("does not open a viewer when no save succeeds", async () => {
    mocks.importTimeline.mockResolvedValue({
      errors: [{ fileName: late.name, error: "unsupported" }],
    });
    await expect(importEu5Batch([late], new AbortController(), vi.fn())).rejects.toThrow(
      "unsupported",
    );
    expect(useHistory.getState().selectedHash).toBeNull();
  });

  it("does not select a date when cancelled before the first result", async () => {
    const controller = new AbortController();
    mocks.importTimeline.mockImplementation(async (_files, options) => {
      controller.abort();
      options.onSnapshots([observation("early", 13600101)], { early });
      return { errors: [] };
    });
    await expect(importEu5Batch([early], controller, vi.fn())).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(useHistory.getState().selectedHash).toBeNull();
  });
  it("opens before the batch finishes and keeps later dates from changing the user's selection", async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const ready = vi.fn().mockResolvedValue(undefined);
    mocks.importTimeline.mockImplementation(async (_files, options) => {
      options.onSnapshots([observation("late", 13600401)], { late });
      options.onProgress(1, 2, late.name);
      await pending;
      options.onSnapshots([observation("early", 13600101)], { early });
      return { errors: [] };
    });
    const importPromise = importEu5Batch([late, early], new AbortController(), ready);
    await vi.waitFor(() => expect(ready).toHaveBeenCalledWith(late));
    expect(useHistory.getState().batchImportProgress?.completed).toBe(1);
    expect(useHistory.getState().selectedHash).toBe("late");
    finish();
    await importPromise;
    expect(ready).toHaveBeenCalledTimes(1);
    expect(useHistory.getState().selectedHash).toBe("late");
    expect(useHistory.getState().snapshots).toHaveLength(2);
    expect(useHistory.getState().batchImportProgress).toBeNull();
  });

  it("lets the viewer cancel the background batch while retaining imported dates", async () => {
    const controller = new AbortController();
    mocks.importTimeline.mockImplementation(async (_files, options) => {
      options.onSnapshots([observation("early", 13600101)], { early });
      await new Promise<void>((resolve) =>
        options.signal.addEventListener("abort", () => resolve(), { once: true }),
      );
      return { errors: [] };
    });
    const ready = vi.fn().mockResolvedValue(undefined);
    const pending = importEu5Batch([early, late], controller, ready);
    await vi.waitFor(() => expect(ready).toHaveBeenCalledWith(early));
    useHistory.getState().cancelBatchImport!();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(useHistory.getState().selectedHash).toBe("early");
    expect(useHistory.getState().files.early).toBe(early);
    expect(useHistory.getState().batchImportProgress).toBeNull();
  });
});
