import { rankDisplay } from "@/lib/ranks";

test("rank display", () => {
  expect(rankDisplay(1)).toBe("1st");
  expect(rankDisplay(2)).toBe("2nd");
  expect(rankDisplay(3)).toBe("3rd");
  expect(rankDisplay(4)).toBe("4th");
  expect(rankDisplay(5)).toBe("5th");
  expect(rankDisplay(6)).toBe("6th");
  expect(rankDisplay(7)).toBe("7th");
  expect(rankDisplay(8)).toBe("8th");
  expect(rankDisplay(9)).toBe("9th");
  expect(rankDisplay(10)).toBe("10th");
  expect(rankDisplay(11)).toBe("11th");
  expect(rankDisplay(12)).toBe("12th");
  expect(rankDisplay(13)).toBe("13th");
  expect(rankDisplay(14)).toBe("14th");
  expect(rankDisplay(15)).toBe("15th");
  expect(rankDisplay(16)).toBe("16th");
  expect(rankDisplay(17)).toBe("17th");
  expect(rankDisplay(18)).toBe("18th");
  expect(rankDisplay(19)).toBe("19th");
  expect(rankDisplay(20)).toBe("20th");
  expect(rankDisplay(21)).toBe("21st");
  expect(rankDisplay(22)).toBe("22nd");
  expect(rankDisplay(23)).toBe("23rd");
  expect(rankDisplay(24)).toBe("24th");
});
