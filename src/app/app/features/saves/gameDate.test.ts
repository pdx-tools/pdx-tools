import { describe, expect, it } from "vitest";
import { formatGameDate } from "./gameDate";

describe("game dates", () => {
  it("formats an ISO 8601 date the way the game shows it", () => {
    expect(formatGameDate("1444-11-11")).toBe("11 November 1444");
    expect(formatGameDate("1337-04-01")).toBe("1 April 1337");
    expect(formatGameDate("garbage")).toBe("garbage");
  });
});
