import { expect, it, vi } from "vitest";
vi.mock("./analysisClient", () => ({ campaignAnalysis: vi.fn() }));
import { acceptResult, HISTORY_REFRESH_MS, refreshDelay } from "./useHistoryQuery";

it("runs a new query now and the same query again at most one time each period", () => {
  expect(refreshDelay(null, "a", 5000)).toBe(0);
  expect(refreshDelay({ identity: "a", at: 5000 }, "b", 5100)).toBe(0);
  expect(refreshDelay({ identity: "a", at: 5000 }, "a", 5300)).toBe(HISTORY_REFRESH_MS - 300);
  expect(refreshDelay({ identity: "a", at: 5000 }, "a", 7000)).toBe(0);
});

it("does not replace a result with a slower result that used fewer snapshots", () => {
  const newer = { identity: "a", result: { snapshots: 3 }, error: null };
  expect(acceptResult(newer, "a", { snapshots: 2 })).toBe(newer);
  expect(acceptResult(newer, "a", { snapshots: 4 }).result).toEqual({ snapshots: 4 });
  expect(acceptResult(newer, "b", { snapshots: 1 }).result).toEqual({ snapshots: 1 });
});
