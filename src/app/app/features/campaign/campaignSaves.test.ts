import { describe, expect, it } from "vitest";
import type { FeedSave } from "@/server-lib/fn/feed";
import { campaignKeyFor } from "./campaignKey";
import { mergeCampaignSaves } from "./campaignSaves";
import type { LocalSaveEntry } from "./localSaves";
import type { PlaythroughId, OpenSave } from "./types";

const CAMPAIGN = "camp" as PlaythroughId;

const upload = (id: string, date: string, user = "Alice"): FeedSave =>
  ({ game: "eu5", id, date, filename: `${id}.eu5`, user_name: user }) as unknown as FeedSave;

const entry = (
  id: string,
  date: string | null,
  {
    playthroughId = CAMPAIGN,
    campaignIdHint = null,
    batch = 1,
  }: { playthroughId?: PlaythroughId | null; campaignIdHint?: string | null; batch?: number } = {},
): LocalSaveEntry => {
  const [year, month, day] = (date ?? "1-1-1").split("-").map(Number);
  return {
    id,
    game: "eu5",
    ref: { kind: "file", file: new File([], `${id}.eu5`) },
    name: `${id}.eu5`,
    identity: date === null ? null : { playthroughId, campaignIdHint, date: { year, month, day } },
    version: null,
    problem: null,
    batch,
  };
};

const openUpload = (saveId: string, date: string): OpenSave => {
  const [year, month, day] = date.split("-").map(Number);
  return {
    game: "eu5",
    playthroughId: CAMPAIGN,
    campaignIdHint: null,
    multiplayer: false,
    date: { year, month, day },
    name: `${saveId}.eu5`,
    source: { kind: "upload", saveId, uploaderId: "u1" },
  };
};

const openLocal = (date: string): OpenSave => ({
  ...openUpload("", date),
  source: { kind: "local", ref: { kind: "file", file: new File([], "local.eu5") } },
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

  it("keeps an upload over a local file that cannot open", () => {
    const saves = mergeCampaignSaves({
      open: openUpload("a", "1350-06-02"),
      uploads: [upload("b", "1400-01-01", "Bob"), upload("a", "1350-06-02")],
      entries: [{ ...entry("l1", "1400-01-01"), problem: { kind: "missing" } }],
      openEntry: undefined,
    });
    expect(saves.map((x) => x.key)).toEqual(["upload:a", "upload:b"]);
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

  it("shows a file of another campaign from the drop of the open save, with a warning", () => {
    const local = entry("open", "1400-01-01");
    const saves = mergeCampaignSaves({
      open: openLocal("1400-01-01"),
      uploads: [],
      entries: [local, entry("other", "1410-01-01", { playthroughId: "else" as PlaythroughId })],
      openEntry: local,
    });
    expect(saves.map((x) => [x.key, x.membership])).toEqual([
      ["local:open", "same"],
      ["local:other", "different"],
    ]);
  });

  it("leaves out files not read yet and files of another drop that are not of the campaign", () => {
    const local = entry("open", "1400-01-01");
    const saves = mergeCampaignSaves({
      open: openLocal("1400-01-01"),
      uploads: [],
      entries: [
        local,
        entry("other", "1410-01-01", { playthroughId: "else" as PlaythroughId, batch: 2 }),
        entry("unknown", "1420-01-01", { playthroughId: null, batch: 2 }),
        entry("pending", null),
      ],
      openEntry: local,
    });
    expect(saves.map((x) => x.key)).toEqual(["local:open"]);
  });

  it("shows a drop that has a file of the campaign, also when the open save is an upload", () => {
    const saves = mergeCampaignSaves({
      open: openUpload("a", "1350-06-02"),
      uploads: [upload("a", "1350-06-02")],
      entries: [
        entry("same", "1400-01-01", { batch: 2 }),
        entry("unknown", "1410-01-01", { playthroughId: null, batch: 2 }),
        entry("elsewhere", "1420-01-01", { playthroughId: null, batch: 3 }),
      ],
      openEntry: undefined,
    });
    expect(saves.map((x) => [x.key, x.membership])).toEqual([
      ["upload:a", "same"],
      ["local:same", "same"],
      ["local:unknown", "unknown"],
    ]);
  });

  it("does not let a file of another campaign hide a save of the campaign", () => {
    const local = entry("open", "1400-01-01");
    const saves = mergeCampaignSaves({
      open: openLocal("1400-01-01"),
      uploads: [upload("b", "1410-01-01")],
      entries: [local, entry("other", "1410-01-01", { playthroughId: "else" as PlaythroughId })],
      openEntry: local,
    });
    expect(saves.map((x) => x.key)).toEqual(["local:open", "upload:b"]);
  });

  it("groups EU4 files by the metadata campaign id until the fingerprint is known", () => {
    const local = entry("open", "1400-01-01", { campaignIdHint: "hint", batch: 1 });
    const saves = mergeCampaignSaves({
      open: { ...openLocal("1400-01-01"), campaignIdHint: "hint" },
      uploads: [],
      entries: [
        local,
        // Of a later drop, but the hint is the same.
        entry("hinted", "1410-01-01", { playthroughId: null, campaignIdHint: "hint", batch: 2 }),
        // The game changed the campaign id, and the exact id is not known.
        entry("changed", "1420-01-01", { playthroughId: null, campaignIdHint: "new", batch: 2 }),
        entry("alone", "1430-01-01", { playthroughId: null, campaignIdHint: "new", batch: 3 }),
      ],
      openEntry: local,
    });
    expect(saves.map((x) => [x.key, x.membership])).toEqual([
      ["local:open", "same"],
      ["local:hinted", "same"],
      ["local:changed", "unknown"],
    ]);
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
    expect(campaignKeyFor({ playthroughId: null, multiplayer: true, userId: "u" })).toBeNull();
  });
});
