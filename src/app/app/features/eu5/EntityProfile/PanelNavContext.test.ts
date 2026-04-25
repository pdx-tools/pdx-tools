import { describe, expect, it } from "vitest";
import { getBreadcrumbItems } from "./Breadcrumb";

describe("panel navigation helpers", () => {
  it("prepends a synthetic root breadcrumb that pops to the natural tier", () => {
    expect(getBreadcrumbItems([{ label: "France" }], "20 countries")).toEqual([
      { label: "20 countries", depth: 0 },
    ]);

    expect(getBreadcrumbItems([{ label: "France" }, { label: "Paris" }], "20 countries")).toEqual([
      { label: "20 countries", depth: 0 },
      { label: "France", depth: 1 },
    ]);
  });
});
