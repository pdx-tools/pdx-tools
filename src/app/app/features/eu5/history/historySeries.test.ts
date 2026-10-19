import { expect, it } from "vitest";
import { historyCsv, indexedValues } from "./historySeries";

it("indexes to the first value and keeps gaps", () => {
  expect(indexedValues([null, 4, null, 6])).toEqual([null, 100, null, 150]);
  // A line that starts at zero cannot be an index.
  expect(indexedValues([0, 4])).toEqual([null, null]);
});

it("writes one row for each saved date and line, with the content hash and game version", () => {
  const csv = historyCsv(
    [
      { contentHash: "a", date: "1400-01-01", gameVersion: "1.0.0" },
      { contentHash: "b", date: "1410-01-01", gameVersion: "1.1.0" },
    ],
    "campaign",
    [{ name: 'Market at "Paris"', values: [2, null] }],
    { metric: "price", good: "wheat" },
  ).split("\n");
  expect(csv).toHaveLength(3);
  expect(csv[1]).toBe(
    '"1400-01-01","campaign","1.0.0","Market at ""Paris""","wheat","price","raw","2","a"',
  );
  expect(csv[2]).toContain('"raw","","b"');
});
