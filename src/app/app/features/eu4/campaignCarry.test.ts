import { expect, it, vi } from "vitest";
vi.mock("./worker/getEu4Worker", () => ({
  getEu4Worker: () => ({
    eu4GetTimeline: async () => ({
      start: { year: 1444, month: 11, day: 11 },
      end: { year: 1444, month: 11, day: 21 },
    }),
    eu4MapColors: async () => ({}),
  }),
}));
vi.mock("@/services/appApi", () => ({ pdxApi: {} }));
vi.mock("./features/map/resources", () => ({ webgl2Capabilities: () => null }));
vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
import { captureEu4Carry } from "./campaignCarry";
import { createEu4Store, initialEu4CountryFilter } from "./store/eu4Store";

it("carries the chart drawer and the country filter to the next save", async () => {
  const save = {
    meta: { total_days: 10 },
    countries: [],
    defaultSelectedCountry: "FRA",
  } as unknown as Parameters<typeof createEu4Store>[0]["save"];
  const map = {
    getCamera: async () => null,
    update: () => {},
    updateProvinceColors: () => {},
  } as unknown as Parameters<typeof createEu4Store>[0]["map"];
  const settings = {} as Parameters<typeof createEu4Store>[0]["settings"];
  const first = await createEu4Store({ store: null, save, map, settings });
  const filter = { ...initialEu4CountryFilter, ai: "great" } as const;
  first.setState({ countryFilter: filter });
  first.getState().actions.setCharts({ open: true, viz: "score" });
  first
    .getState()
    .actions.setCampaignSheet({ open: true, family: "mana", figures: { mana: "mana-banked" } });

  // A step that changes route starts a new store from the carry alone.
  const carry = await captureEu4Carry(first);
  const next = await createEu4Store({ store: null, save, map, settings, carry });
  expect(next.getState().charts).toEqual({ open: true, viz: "score", expanded: false });
  expect(next.getState().campaignSheet).toEqual({
    open: true,
    family: "mana",
    figures: { mana: "mana-banked" },
    mana: { types: "all", use: "all", pool: "adm" },
    expanded: false,
  });
  expect(next.getState().countryFilter).toEqual(filter);
});
