import { expect, it } from "vitest";
import { dayNumber } from "@/features/timeline/date";
import { fittedScale, nearestSave, referenceValue, stripGeometry } from "./ledgerGeometry";

const year = (y: number, month = 1, day = 1) => dayNumber({ year: y, month, day });

it("puts three saves at their dates with wide strokes", () => {
  const days = [year(1444, 11, 11), year(1450), year(1520)];
  const g = stripGeometry(days, 500, 2);
  expect(g.bar).toBe(3);
  expect([g.first, g.last]).toEqual([0, 2]);
  // Their places follow their dates.
  const share = (g.x[1] - g.x[0]) / (g.x[2] - g.x[0]);
  expect(share).toBeCloseTo((days[1] - days[0]) / (days[2] - days[0]), 1);
  expect(nearestSave(g, g.x[1] + 1)).toBe(1);
});

it("keeps 83 yearly saves and a close pair apart", () => {
  const days = Array.from({ length: 83 }, (_, i) => year(1445 + i, 3, 1));
  // Two saves two days apart.
  days.splice(40, 0, days[39] + 2);
  const g = stripGeometry(days, 500, days.length - 1);
  expect([g.first, g.last]).toEqual([0, days.length - 1]);
  for (let i = 1; i < days.length; i++)
    expect(g.x[i] - g.x[i - 1]).toBeGreaterThanOrEqual(g.bar + 1);
});

it("shows the run of saves that fits when 300 saves cannot all stand apart", () => {
  const days = Array.from({ length: 320 }, (_, i) => year(1444) + i * 30);
  const g = stripGeometry(days, 500, 300);
  expect(g.bar).toBe(1);
  expect(g.last - g.first + 1).toBeLessThan(320);
  expect(g.first <= 300 && 300 <= g.last).toBe(true);
  for (let i = g.first + 1; i <= g.last; i++) expect(g.x[i] - g.x[i - 1]).toBeGreaterThanOrEqual(2);
  expect(Number.isNaN(g.x[0])).toBe(true);
  expect(g.beads).toBe(false);
});

it("picks one reference line and a fitted scale", () => {
  expect(referenceValue(901)).toBe(500);
  expect(referenceValue(89)).toBe(50);
  const scale = fittedScale([18500, 22173]);
  expect(scale.lo).toBeLessThanOrEqual(18500);
  expect(scale.hi).toBeGreaterThan(22173);
  expect(scale.steps[0]).toBe(scale.lo);
});

it("never moves a stroke onto another save's date", () => {
  const days = [0, 1, 2, 3, 4, 20, 1000].map((d) => year(1444) + d);
  const g = stripGeometry(days, 400, 4);
  for (let i = g.first; i <= g.last; i++) {
    expect(Math.abs(g.x[i] - g.xDay(days[i]))).toBeLessThanOrEqual(2.5);
    if (i > g.first) expect(g.x[i] - g.x[i - 1]).toBeGreaterThanOrEqual(g.bar + 1);
  }
  expect(g.first <= 4 && 4 <= g.last).toBe(true);
});

it("tries thinner strokes before showing fewer saves", () => {
  const days: number[] = [];
  for (let i = 0, day = year(1444); i < 51; i++) days.push((day += i % 2 ? 9 : 1));
  const g = stripGeometry(days, 113, 50);
  expect(g.last - g.first + 1).toBe(51);
});
