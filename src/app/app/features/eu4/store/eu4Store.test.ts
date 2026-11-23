import { expect, it, vi } from "vitest";
const timeline = vi.hoisted(() => ({
  start: { year: 1444, month: 11, day: 11 },
  end: { year: 1444, month: 11, day: 21 },
}));
vi.mock("../worker/getEu4Worker", () => ({
  getEu4Worker: () => ({
    eu4GetTimeline: async () => ({ ...timeline }),
    eu4MapColors: async () => ({}),
    eu4TimelineAdvance: async (_kind: string, days: number) => ({ days }),
  }),
}));
vi.mock("@/services/appApi", () => ({ pdxApi: {} }));
vi.mock("../features/map/resources", () => ({ webgl2Capabilities: () => null }));
vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
import { createEu4Store } from "./eu4Store";

type Init = Parameters<typeof createEu4Store>[0];

it("keeps the date on a new write of the save, unless the view is at the end", async () => {
  timeline.end = { year: 1444, month: 11, day: 21 };
  const save = {
    meta: { total_days: 10 },
    countries: [],
    defaultSelectedCountry: "FRA",
  } as unknown as Init["save"];
  const map = {
    update: () => {},
    updateProvinceColors: () => {},
    redrawMap: () => {},
  } as unknown as Init["map"];
  const store = await createEu4Store({ store: null, save, map, settings: {} as Init["settings"] });
  const write = async (days: number) => {
    timeline.end = { year: 1444, month: 11, day: 11 + days };
    await store.getState().actions.updateSave({
      meta: { ...save.meta, total_days: days },
      achievements: save.achievements,
      countries: [],
      fileVersion: null,
    });
  };

  // At the end, the view moves to the new end.
  await write(20);
  expect(store.getState().requestedDay).toBe(20);

  // Looking back, the date stays.
  await store.getState().actions.setSelectedDateDay(5);
  await write(30);
  expect(store.getState().requestedDay).toBe(5);

  // A reload writes an earlier date than the kept one: the view lands on the end.
  await store.getState().actions.setSelectedDateDay(25);
  await write(10);
  expect(store.getState().requestedDay).toBe(10);
});
