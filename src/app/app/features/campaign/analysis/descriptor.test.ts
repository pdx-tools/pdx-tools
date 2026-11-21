import { describe, expect, it } from "vitest";
import { descriptorDate } from "./descriptor";

describe("descriptorDate", () => {
  it("reads dates on both sides of year 0", () => {
    expect(descriptorDate({ dateSort: 14441111 })).toEqual({ year: 1444, month: 11, day: 11 });
    // Rust writes -17.12.31 as -17 * 10000 + 1231.
    expect(descriptorDate({ dateSort: -168769 })).toEqual({ year: -17, month: 12, day: 31 });
  });
});
