import { describe, expect, it } from "vitest";
import { exactCellValue } from "./Eu5DataTable";

describe("exactCellValue", () => {
  it("gives a numeric column its full value", () => {
    expect(exactCellValue(12073.9, { variant: "num" })).toBe("12,073.9");
    expect(exactCellValue(1234, { variant: "num" })).toBe("1,234");
  });

  it("gives nothing for a figure that shows in full", () => {
    expect(exactCellValue(293, { variant: "num" })).toBeUndefined();
    expect(exactCellValue(65.8, { variant: "num" })).toBeUndefined();
  });

  it("gives nothing for a column that is not numeric or a value that is not a number", () => {
    expect(exactCellValue(12073.9, {})).toBeUndefined();
    expect(exactCellValue("Paris", { variant: "num" })).toBeUndefined();
    expect(exactCellValue(Number.NaN, { variant: "num" })).toBeUndefined();
  });

  it("uses the form of the column when it has one", () => {
    const exact = (value: number) => `${value * 100}%`;
    expect(exactCellValue(0.5, { variant: "num", exact })).toBe("50%");
  });
});
