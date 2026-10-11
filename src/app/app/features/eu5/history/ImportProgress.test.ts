import { expect, it } from "vitest";
import { importProgressStats } from "./ImportProgress";

it("waits for completed saves before estimating remaining time", () => {
  expect(importProgressStats(0, 10, 5000)).toEqual({ percent: 0, etaSeconds: null });
});

it("estimates remaining time from the observed processing rate", () => {
  expect(importProgressStats(2, 10, 6000)).toEqual({ percent: 20, etaSeconds: 24 });
  expect(importProgressStats(5, 10, 10000)).toEqual({ percent: 50, etaSeconds: 10 });
});

it("reaches 100 percent at completion and handles empty imports", () => {
  expect(importProgressStats(10, 10, 12000)).toEqual({ percent: 100, etaSeconds: 0 });
  expect(importProgressStats(0, 0, 1000)).toEqual({ percent: 0, etaSeconds: null });
});

it("waits for a batch of concurrent jobs before estimating phase throughput", () => {
  expect(importProgressStats(1, 200, 3000, 8).etaSeconds).toBeNull();
  expect(importProgressStats(8, 200, 3000, 8).etaSeconds).toBe(72);
});
