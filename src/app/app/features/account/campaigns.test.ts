import { describe, expect, it } from "vitest";
import { eu5DateOrdinal, formatGameDate, groupEu5Campaigns, mergeCampaigns } from "./campaigns";
import type { Eu5CampaignSave } from "./campaigns";

const save = (over: Partial<Eu5CampaignSave>): Eu5CampaignSave => ({
  id: "a",
  upload_time: "2026-09-01T00:00:00.000Z",
  filename: "a.eu5",
  date: "1337-04-01",
  playthrough_id: "pt-greenland",
  playthrough_name: "greenland",
  version_major: 1,
  version_minor: 0,
  version_patch: 0,
  ...over,
});

describe("game dates", () => {
  it("formats EU5 and EU4 dates alike", () => {
    expect(formatGameDate("1444-11-11")).toBe("11 November 1444");
    expect(formatGameDate("1670-02-16")).toBe("16 February 1670");
    expect(formatGameDate("garbage")).toBe("garbage");
  });

  it("orders by year, then month, then day", () => {
    expect(eu5DateOrdinal("1341-03-08")).toBeGreaterThan(eu5DateOrdinal("1340-12-30"));
    expect(eu5DateOrdinal("1341-03-08")).toBeLessThan(eu5DateOrdinal("1341-03-09"));
  });
});

describe("campaign grouping", () => {
  it("groups EU5 saves by playthrough id, latest game date first", () => {
    const campaigns = groupEu5Campaigns([
      save({ id: "early", date: "1337-04-01", upload_time: "2026-09-02T00:00:00.000Z" }),
      save({ id: "late", date: "1341-03-08", upload_time: "2026-09-01T00:00:00.000Z" }),
      save({ id: "other", playthrough_id: "pt-bohemia", playthrough_name: "bohemia" }),
    ]);
    expect(campaigns.map((c) => c.name)).toEqual(["greenland", "bohemia"]);
    expect(campaigns[0].saves.map((s) => s.id)).toEqual(["late", "early"]);
    expect(campaigns[0].latestUpload).toBe("2026-09-02T00:00:00.000Z");
  });

  it("keeps campaigns with the same name apart", () => {
    const campaigns = groupEu5Campaigns([
      save({ id: "first" }),
      save({ id: "second", playthrough_id: "pt-other" }),
    ]);
    expect(campaigns.map((c) => c.key)).toEqual(["eu5:pt-greenland", "eu5:pt-other"]);
  });

  it("shows the name of the furthest save of a renamed campaign", () => {
    // The furthest save goes up first, so the most recent upload carries the stale name.
    const [campaign] = groupEu5Campaigns([
      save({
        id: "old",
        date: "1337-04-01",
        playthrough_name: "greenland",
        upload_time: "2026-09-03T00:00:00.000Z",
      }),
      save({
        id: "new",
        date: "1341-03-08",
        playthrough_name: "grœnland",
        upload_time: "2026-09-01T00:00:00.000Z",
      }),
    ]);
    expect(campaign.name).toBe("grœnland");
    expect(campaign.saves).toHaveLength(2);
    expect(campaign.latestUpload).toBe("2026-09-03T00:00:00.000Z");
  });

  it("merges games by most recent upload", () => {
    const [older] = groupEu5Campaigns([save({ upload_time: "2026-01-01T00:00:00.000Z" })]);
    const [newer] = groupEu5Campaigns([
      save({
        playthrough_id: "pt-b",
        playthrough_name: "b",
        upload_time: "2026-02-01T00:00:00.000Z",
      }),
    ]);
    expect(mergeCampaigns([older], [newer]).map((c) => c.name)).toEqual(["b", "greenland"]);
  });
});
