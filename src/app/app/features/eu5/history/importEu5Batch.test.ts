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
  useHistory.setState({ panelOpen: false, insightOpen: false });
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
      new AbortController().signal,
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
    const result = await importEu5Batch([late, early], new AbortController().signal, vi.fn());
    expect(result.file).toBe(early);
    expect(result.issues).toEqual(["Cache could not be written", "late.EU5: missing field morale"]);
  });

  it("does not open a viewer when no save succeeds", async () => {
    mocks.importTimeline.mockResolvedValue({
      errors: [{ fileName: late.name, error: "unsupported" }],
    });
    await expect(importEu5Batch([late], new AbortController().signal, vi.fn())).rejects.toThrow(
      "unsupported",
    );
    expect(useHistory.getState().selectedHash).toBeNull();
  });

  it("does not select a date after cancellation", async () => {
    const controller = new AbortController();
    mocks.importTimeline.mockImplementation(async (_files, options) => {
      options.onSnapshots([observation("early", 13600101)], { early });
      controller.abort();
      return { errors: [] };
    });
    await expect(importEu5Batch([early], controller.signal, vi.fn())).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(useHistory.getState().selectedHash).toBeNull();
  });
});
