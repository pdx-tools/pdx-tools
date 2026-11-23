import { expect, it } from "vitest";
import { dayNumber } from "@/features/timeline/date";
import { timeTicks } from "./timeTicks";

it("puts ticks on round years, or on months for saves within one year", () => {
  const long = timeTicks(
    dayNumber({ year: 1444, month: 11, day: 11 }),
    dayNumber({ year: 1527, month: 1, day: 27 }),
    5,
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
    5,
  );
  expect(short.ticks.map(short.label)).toEqual(["1444 Jun", "1444 Jul"]);

  // Two saves in one month.
  const days = timeTicks(
    dayNumber({ year: 1444, month: 3, day: 12 }),
    dayNumber({ year: 1444, month: 3, day: 16 }),
    5,
  );
  expect(days.ticks.map(days.label)).toEqual(["1444 Mar 12", "1444 Mar 16"]);

  // The padding reaches the first of the month, but one month tick says little.
  const early = timeTicks(
    dayNumber({ year: 1500, month: 3, day: 3 }),
    dayNumber({ year: 1500, month: 3, day: 5 }),
    5,
  );
  expect(early.ticks.map(early.label)).toEqual(["1500 Mar 3", "1500 Mar 5"]);
});
