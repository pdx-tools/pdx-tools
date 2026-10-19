import { beforeEach, expect, it, vi } from "vitest";
import type { SaveQueries } from "../game-adapter";
const query = vi.hoisted(() => vi.fn());
vi.mock("./analysisClient", () => ({ queryAnalysisOverview: query }));
import { overviewQueries } from "./overviewQueries";

beforeEach(() => query.mockReset());

it.each([
  ["getStateEfficacy", "stateEfficacy"],
  ["getDevelopmentInsight", "development"],
  ["getWealthInsight", "wealth"],
  ["getWealthScope", "wealthScope"],
  ["getUnrealizedTaxBaseInsight", "unrealizedTaxBase"],
  ["getUnrealizedTaxBaseScope", "unrealizedTaxBaseScope"],
  ["getMarketInsight", "markets"],
  ["getPopulationInsight", "population"],
  ["getPopulationGrowthInsight", "populationGrowth"],
  ["getBuildingLevelsInsight", "buildingLevels"],
  ["getReligionInsight", "religion"],
  ["getRgoInsight", "rgoLevel"],
  ["getControlInsight", "control"],
  ["getPoliticalWorldScoreboard", "political"],
])("reads %s from the shown observation's %s columns", async (method, column) => {
  const live = vi.fn();
  const data = { observation: "shown" };
  query.mockResolvedValue({ hash: "shown", data });
  const queries = overviewQueries({ [method]: live } as unknown as SaveQueries, "shown");
  expect(await Reflect.get(queries, method)()).toBe(data);
  expect(query).toHaveBeenCalledExactlyOnceWith("shown", column);
  expect(live).not.toHaveBeenCalled();
});

it("leaves entity and other live-save queries unchanged", async () => {
  const getCountryProfile = vi.fn(async () => "profile");
  const queries = overviewQueries({ getCountryProfile } as unknown as SaveQueries, "shown");
  expect(queries.getCountryProfile).toBe(getCountryProfile);
  await queries.getCountryProfile(1);
  expect(query).not.toHaveBeenCalled();
});

it("rejects a response describing another observation", async () => {
  query.mockResolvedValue({ hash: "other", data: {} });
  await expect(
    overviewQueries({} as SaveQueries, "shown").getWealthInsight(),
  ).rejects.toMatchObject({ name: "AbortError" });
});
