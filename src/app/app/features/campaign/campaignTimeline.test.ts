import { expect, it } from "vitest";
import { publishCampaignTimeline } from "./campaignTimeline";
import type { CampaignSave } from "./types";

const save = (year: number, isOpen = false) =>
  ({ key: String(year), date: { year, month: 1, day: 1 }, isOpen }) as CampaignSave;
it("holds the entire published date set while metadata arrives, then publishes once", () => {
  const original = [save(1340, true)];
  const published = { key: "campaign", saves: original };
  expect(publishCampaignTimeline(published, "campaign", [...original, save(1350)], 2)).toBe(
    published,
  );
  expect(
    publishCampaignTimeline(published, "campaign", [...original, save(1350), save(1330)], 1),
  ).toBe(published);
  const dates = [save(1330), ...original, save(1350)];
  const complete = publishCampaignTimeline(published, "campaign", dates, 0);
  expect(complete.saves).toBe(dates);
  expect(publishCampaignTimeline(complete, "campaign", dates, 0)).toBe(complete);
});
it("does not carry dates to another campaign, including when metadata is pending", () => {
  const old = { key: "first", saves: [save(1400)] };
  const current = save(1340, true);
  expect(publishCampaignTimeline(old, "second", [current, save(1350)], 1).saves).toEqual([current]);
  expect(publishCampaignTimeline(old, null, [], 0).saves).toEqual([]);
});

it("updates the open bookmark during reading without publishing new dates", () => {
  const first = save(1340, true),
    second = save(1350);
  const published = { key: "campaign", saves: [first, second] };
  const result = publishCampaignTimeline(
    published,
    "campaign",
    [{ ...first, isOpen: false }, { ...second, isOpen: true }, save(1360)],
    1,
  );
  expect(result.saves.map((save) => save.date.year)).toEqual([1340, 1350]);
  expect(result.saves.map((save) => save.isOpen)).toEqual([false, true]);
});
