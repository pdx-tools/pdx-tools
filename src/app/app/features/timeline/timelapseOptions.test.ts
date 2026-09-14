import { describe, expect, it } from "vitest";
import {
  MIN_TIMELAPSE_SECONDS,
  TIMELAPSE_FPS,
  TIMELAPSE_SECONDS,
  formatCampaignSpan,
  formatDuration,
  formatFileSize,
  timelapsePlan,
  timelapseYearsPerSecond,
} from "@pdx.tools/timelapse";
import type { TimelapseOptions } from "@pdx.tools/timelapse";

const BASE: TimelapseOptions = { framing: "world", quality: "1080p" };

describe("timelapsePlan", () => {
  it("paces a full campaign to the target length", () => {
    const plan = timelapsePlan({ totalDays: 377 * 365, options: BASE });
    expect(plan.seconds).toBeCloseTo(TIMELAPSE_SECONDS, 0);
    expect(plan.frames).toBe(Math.round(plan.seconds * TIMELAPSE_FPS));
  });

  it("lets a short campaign run shorter rather than crawl", () => {
    // 12 years at a year a second is 12 seconds; stretching it to 30 would
    // leave the borders still for seconds at a time.
    const plan = timelapsePlan({ totalDays: 12 * 365, options: BASE });
    expect(plan.yearsPerSecond).toBe(1);
    expect(plan.seconds).toBeCloseTo(12, 0);
  });

  it("gives a campaign of a few years a film that can be watched", () => {
    // 3 years at a year a second is a 3-second flash; the film holds at the
    // minimum length and the years pass slower.
    const plan = timelapsePlan({ totalDays: 3 * 365, options: BASE });
    expect(plan.seconds).toBeCloseTo(MIN_TIMELAPSE_SECONDS, 0);
    expect(plan.yearsPerSecond).toBeCloseTo(0.3, 6);
  });

  it("covers the whole campaign with the frames it plans", () => {
    const totalDays = 8742;
    const plan = timelapsePlan({ totalDays, options: BASE });
    expect(plan.daysPerFrame * (plan.frames - 1)).toBeCloseTo(totalDays, 6);
  });

  it("costs less at 720p than at 1080p", () => {
    const big = timelapsePlan({ totalDays: 20000, options: BASE });
    const small = timelapsePlan({ totalDays: 20000, options: { ...BASE, quality: "720p" } });
    expect(small.bytes).toBeLessThan(big.bytes);
    expect(small.seconds).toBe(big.seconds);
  });

  it("survives a save with no elapsed campaign", () => {
    const plan = timelapsePlan({ totalDays: 0, options: BASE });
    expect(plan.frames).toBeGreaterThanOrEqual(2);
    expect(Number.isFinite(plan.daysPerFrame)).toBe(true);
  });
});

describe("timelapseYearsPerSecond", () => {
  it("holds a year a second between the shortest and the target length", () => {
    expect(timelapseYearsPerSecond(10 * 365)).toBe(1);
    expect(timelapseYearsPerSecond(30 * 365)).toBe(1);
  });

  it("slows under a year a second only to reach the shortest film", () => {
    expect(timelapseYearsPerSecond(5 * 365)).toBe(0.5);
  });

  it("speeds up so a long campaign still fits the target length", () => {
    expect(timelapseYearsPerSecond(300 * 365)).toBe(10);
  });
});

describe("formatting", () => {
  it("reads durations off a video player", () => {
    expect(formatDuration(24)).toBe("0:24");
    expect(formatDuration(68)).toBe("1:08");
    expect(formatDuration(600)).toBe("10:00");
  });

  it("reads sizes off an upload dialog", () => {
    expect(formatFileSize(940_000)).toBe("940 KB");
    expect(formatFileSize(7_400_000)).toBe("7.4 MB");
  });

  it("counts the campaign in whole years", () => {
    expect(formatCampaignSpan(377 * 365)).toBe("377 years");
    expect(formatCampaignSpan(200)).toBe("1 year");
    expect(formatCampaignSpan(0)).toBe("1 year");
  });
});
