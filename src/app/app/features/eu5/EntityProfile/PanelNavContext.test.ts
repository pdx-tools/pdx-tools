import { describe, expect, it } from "vitest";
import type { SelectionSummaryData } from "@/wasm/wasm_eu5";
import { getBreadcrumbItems } from "./Breadcrumb";
import { getSelectionIdentityKey } from "./selectionIdentity";

function selection(overrides: Partial<SelectionSummaryData> = {}): SelectionSummaryData {
  return {
    entityCount: 2,
    locationCount: 20,
    isEmpty: false,
    totalPopulation: 1000,
    preset: undefined,
    focusedLocation: undefined,
    focusedLocationName: undefined,
    derivedEntityAnchor: undefined,
    scopeDisplayName: undefined,
    firstLocationIdx: undefined,
    ...overrides,
  };
}

describe("panel navigation helpers", () => {
  it("uses identity fields beyond selection counts", () => {
    const base = selection();

    expect(getSelectionIdentityKey(base)).not.toEqual(
      getSelectionIdentityKey(selection({ derivedEntityAnchor: 42 })),
    );
    expect(getSelectionIdentityKey(base)).not.toEqual(
      getSelectionIdentityKey(selection({ preset: "players" })),
    );
  });

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
