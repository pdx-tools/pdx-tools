import { expect, it } from "vitest";
import { eu4ParserAdapter } from "./parserAdapter";

it("reads no metadata before the parse, so a save without a campaign hint is not refused", () => {
  expect(eu4ParserAdapter.refuse(new File(["no metadata"], "Lisbon.eu4"))).toBeNull();
  expect(eu4ParserAdapter.refuse(new File([""], "test.EU4.zst"))).toBeNull();
  expect(eu4ParserAdapter.refuse(new File([""], "test.eu5"))).toBe("Not an EU4 save");
});
