import { expect, it } from "vitest";
import { campaignFigures, csvSuffix, familyHint, familyOf, families, figureOf } from "./figures";

it("keeps each family's last option and one unit in each family", () => {
  expect(families.map((x) => x.id)).toEqual(["development", "army", "manpower", "world", "mana"]);
  const chosen = { mana: "mana-banked", army: "mana-use" } as const;
  expect(figureOf("mana", chosen)).toBe("mana-banked");
  // A choice that is not of the family falls back to its first figure.
  expect(figureOf("army", chosen)).toBe("army");
  for (const family of families)
    expect(new Set(family.figures.map((x) => campaignFigures[x].unit)).size, family.id).toBe(1);
  expect(familyHint(familyOf("mana"))).toBe("By use · By country · Banked");
  expect(familyHint(familyOf("army"))).toBe("");
  // Raw stays the default of both development families.
  expect(figureOf("development", {})).toBe("development");
  expect(familyHint(familyOf("world"))).toBe("Raw · Autonomy-adjusted");
});

it("names the chosen option in the CSV's file name", () => {
  expect(csvSuffix("development", "autonomy-development")).toBe(
    "-campaign-development-autonomy-adjusted.csv",
  );
  expect(csvSuffix("army", "army")).toBe("-campaign-army.csv");
});

it("never writes a value just under zero as -0", () => {
  const { format, fine } = campaignFigures["mana-banked"];
  expect(format(-0.3)).toBe("0");
  expect(format(-1.2)).toBe("-1");
  expect(fine(-0.001, 2)).toBe("0.00");
});
