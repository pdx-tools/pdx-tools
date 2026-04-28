import { describe, expect, it } from "vitest";
import { getBreadcrumbItems } from "./Breadcrumb";
import { countryProfileEntry, locationProfileEntry } from "./PanelNavContext";

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

  it("builds typed profile navigation entries", () => {
    expect(countryProfileEntry(42, "France")).toEqual({
      kind: "profile",
      profile: { kind: "country", anchor_location_idx: 42, label: "France" },
      label: "France",
    });

    expect(locationProfileEntry(99, "Paris")).toEqual({
      kind: "focus",
      profile: { kind: "location", location_idx: 99, label: "Paris" },
      label: "Paris",
    });
  });
});
