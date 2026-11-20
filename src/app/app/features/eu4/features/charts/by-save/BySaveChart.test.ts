import { expect, it } from "vitest";
import { dayNumber } from "@/features/timeline/date";
import { timeTicks } from "./BySaveChart";

it("puts ticks on round years, or on months for saves within one year", () => {
  const long = timeTicks(
    dayNumber({ year: 1444, month: 11, day: 11 }),
    dayNumber({ year: 1527, month: 1, day: 27 }),
  );
  expect(long.ticks.map(long.label)).toEqual([
    "1450",
    "1460",
    "1470",
    "1480",
    "1490",
    "1500",
    "1510",
    "1520",
  ]);

  // Two saves in June.
  const short = timeTicks(
    dayNumber({ year: 1444, month: 5, day: 27 }),
    dayNumber({ year: 1444, month: 7, day: 5 }),
  );
  expect(short.ticks.map(short.label)).toEqual(["Jun 1444", "Jul 1444"]);
});
