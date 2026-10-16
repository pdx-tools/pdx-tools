import { describe, expect, it } from "vitest";
import { getBreadcrumbItems } from "./Breadcrumb";
import {
  DEFAULT_PROFILE_TABS,
  countryProfileEntry,
  marketProfileEntry,
  remapProfileStack,
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
      profile: { kind: "country", country: { key: 42, name: "France" } },
      label: "France",
    });

    expect(locationProfileEntry(99, "Paris")).toEqual({
      kind: "focus",
      profile: { kind: "location", location: { key: 99, name: "Paris" } },
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

describe("saved-date breadcrumb remapping", () => {
  const stack = [countryProfileEntry(4, "France"), marketProfileEntry(8, "Paris")];

  it("replaces every stored identity so returning to a parent uses the new save", () => {
    const profiles = [countryProfileEntry(17, "France"), marketProfileEntry(20, "Paris")].map(
      (e) => e.profile,
    );
    const remapped = remapProfileStack(stack, profiles);
    expect(remapped).toEqual([countryProfileEntry(17, "France"), marketProfileEntry(20, "Paris")]);
    expect(remapped.slice(0, 1)[0].profile).toEqual(profiles[0]);
    expect(stack[0]).toEqual(countryProfileEntry(4, "France"));
  });

  it("removes a vanished profile and its descendants", () => {
    expect(remapProfileStack(stack, [countryProfileEntry(17, "France").profile])).toEqual([
      countryProfileEntry(17, "France"),
    ]);
    expect(remapProfileStack(stack, [])).toEqual([]);
  });

  it("does not associate a remapped identity with a different breadcrumb kind", () => {
    expect(remapProfileStack(stack, [locationProfileEntry(4, "Paris").profile])).toEqual([]);
  });
});
