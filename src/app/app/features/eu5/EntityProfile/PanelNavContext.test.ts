import { describe, expect, it } from "vitest";
import { getBreadcrumbItems } from "./Breadcrumb";
import {
  DEFAULT_PROFILE_TABS,
  countryProfileEntry,
  locationProfileEntry,
  setProfileTabValue,
} from "./PanelNavContext";

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

  it("tracks profile tabs independently by profile type", () => {
    const countryTabs = setProfileTabValue(DEFAULT_PROFILE_TABS, "country", "population");
    expect(countryTabs).toEqual({
      country: "population",
      market: "overview",
      location: "overview",
    });

    const marketTabs = setProfileTabValue(countryTabs, "market", "goods");
    expect(marketTabs).toEqual({
      country: "population",
      market: "goods",
      location: "overview",
    });

    const locationTabs = setProfileTabValue(marketTabs, "location", "buildings");
    expect(locationTabs).toEqual({
      country: "population",
      market: "goods",
      location: "buildings",
    });
  });
});
