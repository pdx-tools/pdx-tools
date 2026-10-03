import { describe, expect, it } from "vitest";
import type { FeedSave } from "@/server-lib/fn/feed";
import { campaignKeyFor } from "./campaignKey";
import { mergeCampaignSaves } from "./campaignSaves";
import type { LocalSaveEntry } from "./localSaves";
import { toCampaignId } from "./types";
import type { CampaignId, OpenSave } from "./types";

const CAMPAIGN = "camp" as CampaignId;

const upload = (id: string, date: string, user = "Alice"): FeedSave =>
  ({ game: "eu5", id, date, filename: `${id}.eu5`, user_name: user }) as unknown as FeedSave;

const entry = (
  id: string,
  date: string | null,
  campaignId: CampaignId | null = CAMPAIGN,
): LocalSaveEntry => {
  const [year, month, day] = (date ?? "1-1-1").split("-").map(Number);
  return {
    id,
    game: "eu5",
    ref: { kind: "file", file: new File([], `${id}.eu5`) },
    name: `${id}.eu5`,
    header: date === null ? null : { campaignId, date: { year, month, day } },
    problem: null,
    batch: 1,
  };
};

const openUpload = (saveId: string, date: string): OpenSave => {
  const [year, month, day] = date.split("-").map(Number);
  return {
    game: "eu5",
    campaignId: CAMPAIGN,
    playthroughId: "camp",
    multiplayer: false,
    date: { year, month, day },
    name: `${saveId}.eu5`,
    source: { kind: "upload", saveId, uploaderId: "u1" },
  };
};

const openLocal = (date: string): OpenSave => ({
  ...openUpload("", date),
  source: { kind: "local", ref: null },
});

describe("mergeCampaignSaves", () => {
  it("orders saves by date and marks the open upload", () => {
    const saves = mergeCampaignSaves({
      open: openUpload("b", "1400-01-01"),
      uploads: [upload("c", "1450-01-01"), upload("b", "1400-01-01"), upload("a", "1350-06-02")],
      entries: [],
      openEntry: undefined,
    });
    expect(saves.map((x) => x.key)).toEqual(["upload:a", "upload:b", "upload:c"]);
    expect(saves.map((x) => x.isOpen)).toEqual([false, true, false]);
  });

  it("keeps a local file over an upload of the same date", () => {
    const saves = mergeCampaignSaves({
      open: openUpload("a", "1350-06-02"),
      uploads: [upload("b", "1400-01-01", "Bob"), upload("a", "1350-06-02")],
      entries: [entry("l1", "1400-01-01")],
      openEntry: undefined,
    });
    expect(saves.map((x) => x.key)).toEqual(["upload:a", "local:l1"]);
    expect(saves[1].source).toEqual({ kind: "local", entryId: "l1", uploadedBy: "Bob" });
  });

  it("keeps the open upload over a local file of the same date", () => {
    const saves = mergeCampaignSaves({
      open: openUpload("a", "1350-06-02"),
      uploads: [upload("a", "1350-06-02")],
      entries: [entry("l1", "1350-06-02")],
      openEntry: undefined,
    });
    expect(saves.map((x) => x.key)).toEqual(["upload:a"]);
  });

  it("leaves out files of other campaigns and files not read yet", () => {
    const local = entry("open", "1400-01-01");
    const saves = mergeCampaignSaves({
      open: openLocal("1400-01-01"),
      uploads: [],
      entries: [local, entry("other", "1410-01-01", "else" as CampaignId), entry("pending", null)],
      openEntry: local,
    });
    expect(saves.map((x) => x.key)).toEqual(["local:open"]);
    expect(saves[0].isOpen).toBe(true);
  });

  it("groups no files when the saves have no campaign id", () => {
    const local = entry("open", "1400-01-01", null);
    const saves = mergeCampaignSaves({
      open: { ...openLocal("1400-01-01"), campaignId: toCampaignId("") },
      uploads: [],
      entries: [local, entry("other", "1410-01-01", null)],
      openEntry: local,
    });
    expect(saves.map((x) => x.key)).toEqual(["open"]);
  });

  it("adds the open save when no list has it", () => {
    const saves = mergeCampaignSaves({
      open: openUpload("z", "1500-01-01"),
      uploads: [upload("a", "1350-06-02")],
      entries: [],
      openEntry: undefined,
    });
    expect(saves.map((x) => [x.key, x.isOpen])).toEqual([
      ["upload:a", false],
      ["open", true],
    ]);
  });
});

describe("campaignKeyFor", () => {
  it("matches the server's key", () => {
    expect(campaignKeyFor({ playthroughId: "p", multiplayer: true, userId: "u" })).toBe("p");
    expect(campaignKeyFor({ playthroughId: "p", multiplayer: false, userId: "u" })).toBe("p:u");
  });

  it("has no key for a single-player save of an unknown user", () => {
    expect(campaignKeyFor({ playthroughId: "p", multiplayer: false, userId: null })).toBeNull();
    expect(campaignKeyFor({ playthroughId: "", multiplayer: true, userId: "u" })).toBeNull();
  });
});
