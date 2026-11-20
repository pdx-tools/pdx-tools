import { expect, it } from "vitest";
import { dayNumber } from "@/features/timeline/date";
import {
  countryScale,
  fittedScale,
  nearestSave,
  referenceValue,
  stripGeometry,
} from "./ledgerGeometry";

const year = (y: number, month = 1, day = 1) => dayNumber({ year: y, month, day });

it("puts three saves at their dates with wide strokes", () => {
  const days = [year(1444, 11, 11), year(1450), year(1520)];
  const g = stripGeometry(days, 500, 2);
  expect(g.bar).toBe(4);
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
  expect(g.bar).toBe(1);
  expect(g.last - g.first + 1).toBeGreaterThanOrEqual(45);
});

/** The dates of the kush campaign's 83 analyzed saves. */
const KUSH = [
  "1445-3-1",
  "1446-3-1",
  "1447-3-1",
  "1448-3-1",
  "1449-3-1",
  "1450-3-1",
  "1451-3-1",
  "1452-3-1",
  "1453-3-1",
  "1454-3-1",
  "1455-3-1",
  "1456-3-1",
  "1457-3-1",
  "1458-3-1",
  "1459-3-1",
  "1460-3-1",
  "1461-1-1",
  "1462-1-1",
  "1463-2-1",
  "1464-2-1",
  "1465-3-1",
  "1466-3-1",
  "1467-3-1",
  "1468-3-1",
  "1469-3-1",
  "1470-3-1",
  "1471-3-1",
  "1472-3-1",
  "1473-3-1",
  "1474-3-1",
  "1475-3-1",
  "1476-3-1",
  "1477-3-1",
  "1478-3-1",
  "1479-3-1",
  "1480-3-1",
  "1481-3-1",
  "1482-3-1",
  "1483-3-1",
  "1484-3-1",
  "1485-3-1",
  "1486-3-1",
  "1487-3-1",
  "1488-3-1",
  "1489-3-1",
  "1490-3-1",
  "1491-3-1",
  "1492-3-1",
  "1493-3-1",
  "1494-3-1",
  "1495-3-1",
  "1496-3-1",
  "1497-3-1",
  "1498-3-1",
  "1499-3-1",
  "1500-3-1",
  "1501-3-1",
  "1502-3-1",
  "1503-1-7",
  "1504-2-1",
  "1505-2-1",
  "1506-2-1",
  "1507-2-1",
  "1508-2-1",
  "1509-2-1",
  "1510-2-1",
  "1511-2-1",
  "1512-2-1",
  "1513-2-1",
  "1514-2-1",
  "1515-2-1",
  "1516-2-1",
  "1517-3-1",
  "1518-3-1",
  "1519-3-1",
  "1520-3-1",
  "1521-3-1",
  "1522-4-1",
  "1523-1-1",
  "1524-3-1",
  "1525-3-1",
  "1526-3-1",
  "1527-1-27",
].map((x) => {
  const [y, m, d] = x.split("-").map(Number);
  return year(y, m, d);
});

it.each([
  ["the 800 px drawer", 469, 2],
  ["the 520 px drawer", 243, 1],
])("gives every kush stroke one whole-pixel width at whole pixels in %s", (_, width, bar) => {
  const g = stripGeometry(KUSH, width, KUSH.length - 1);
  expect(g.bar).toBe(bar);
  expect([g.first, g.last]).toEqual([0, KUSH.length - 1]);
  for (let i = 0; i < KUSH.length; i++) {
    expect(Number.isInteger(g.x[i])).toBe(true);
    if (i > 0) expect(g.x[i] - g.x[i - 1]).toBeGreaterThanOrEqual(bar + 1);
  }
});

it("puts the scale's top above the largest value with headroom", () => {
  for (const max of [42, 89.2, 901, 1013, 1999, 22173]) {
    const scale = countryScale(max);
    expect(scale.hi).toBeGreaterThanOrEqual(max * 1.05);
    expect(scale.hi).toBeLessThanOrEqual(max * 1.5);
    expect(scale.refs.at(-1)).toBe(scale.hi);
    expect(scale.refs[0]).toBeLessThan(scale.hi);
  }
  expect(countryScale(901).hi).toBe(1000);
});
