import { describe, expect, it } from "vitest";
import { userId } from "@/lib/auth";
import { campaignKeyFor } from "./campaignKey";
import { mergeCampaign, mergeCampaignSaves } from "./campaignSaves";
import type { CampaignUpload } from "./campaignSaves";
import type { LocalSaveEntry } from "./localSaves";
import { toPlaythroughId } from "./types";
import type { PlaythroughId, OpenSave } from "./types";

const CAMPAIGN = "camp" as PlaythroughId;

const upload = (id: string, date: string, user = "Alice"): CampaignUpload => ({
  game: "eu5",
  id,
  date,
  filename: `${id}.eu5`,
  user_id: userId("u1"),
  user_name: user,
});

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
  source: {
    kind: "local",
    entryId: null,
    fileVersion: null,
    ref: { kind: "file", file: new File([], "local.eu5") },
  },
});

describe("mergeCampaignSaves", () => {
  it("names the saves that share a date with a save of the list", () => {
    const { saves, leftOut } = mergeCampaign({
      open: openUpload("c", "1450-01-01"),
      uploads: [upload("c", "1450-01-01"), upload("b", "1400-01-01"), upload("old", "1400-01-01")],
      entries: [
        entry("auto", "1400-01-01"),
        entry("manual", "1400-01-01"),
        entry("x", "1500-01-01"),
      ],
      openEntry: undefined,
    });
    expect(saves.map((x) => x.key)).toEqual(["local:manual", "upload:c", "local:x"]);
    // An upload beside a local file of its date is not named.
    expect(leftOut.map((x) => [x.save.key, x.kept.key])).toEqual([["local:auto", "local:manual"]]);
  });

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

  it("keeps the uploader name when a local file replaces another at the same date", () => {
    const saves = mergeCampaignSaves({
      open: openUpload("a", "1350-06-02"),
      uploads: [upload("b", "1400-01-01", "Bob"), upload("a", "1350-06-02")],
      entries: [entry("l1", "1400-01-01"), entry("l2", "1400-01-01")],
      openEntry: undefined,
    });
    expect(saves.map((x) => x.key)).toEqual(["upload:a", "local:l2"]);
    expect(saves[1].source).toEqual({ kind: "local", entryId: "l2", uploadedBy: "Bob" });
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

  describe("EU4 multiplayer files", () => {
    const eu4 = (id: string, date: string, hint: string, batch: number, known = false) => ({
      ...entry(id, date, {
        playthroughId: known ? CAMPAIGN : null,
        campaignIdHint: hint,
        batch,
      }),
      game: "eu4" as const,
    });
    const open = (hint: string): OpenSave => ({
      ...openLocal("1502-08-02"),
      game: "eu4",
      campaignIdHint: hint,
      multiplayer: true,
    });
    const first = eu4("first", "1502-08-02", "h1", 1, true);

    it("takes files added one at a time as saves of the campaign while their campaign is unknown", () => {
      const saves = mergeCampaignSaves({
        open: open("h1"),
        uploads: [],
        entries: [first, eu4("second", "1526-04-18", "h2", 2), eu4("third", "1547-06-09", "h3", 3)],
        openEntry: first,
      });
      expect(saves.map((x) => [x.key, x.membership])).toEqual([
        ["local:first", "same"],
        ["local:second", "unknown"],
        ["local:third", "unknown"],
      ]);
    });

    it("takes files added together the same way", () => {
      const saves = mergeCampaignSaves({
        open: open("h1"),
        uploads: [],
        entries: [first, eu4("second", "1526-04-18", "h2", 2), eu4("third", "1547-06-09", "h3", 2)],
        openEntry: first,
      });
      expect(saves.map((x) => x.key)).toEqual(["local:first", "local:second", "local:third"]);
    });

    it("leaves out an added file that a full parse finds of another campaign, and files tied to it", () => {
      const refuted = {
        ...eu4("kush", "1444-11-11", "k", 2),
        identity: {
          playthroughId: "kush" as PlaythroughId,
          campaignIdHint: "k",
          date: { year: 1444, month: 11, day: 11 },
        },
      };
      const saves = mergeCampaignSaves({
        open: open("h1"),
        uploads: [],
        entries: [
          first,
          refuted,
          // Of the same drop as a file of another campaign.
          eu4("dropped", "1460-01-01", "x", 2),
          // With the metadata id of a file of another campaign.
          eu4("hinted", "1470-01-01", "k", 3),
          eu4("second", "1526-04-18", "h2", 4),
        ],
        openEntry: first,
      });
      expect(saves.map((x) => [x.key, x.membership])).toEqual([
        ["local:first", "same"],
        ["local:second", "unknown"],
      ]);
    });

    it("keeps a save known to be of the campaign over an added file of its date", () => {
      const saves = mergeCampaign({
        open: open("h1"),
        uploads: [{ ...upload("u", "1526-04-18"), game: "eu4" }],
        entries: [first, eu4("other", "1526-04-18", "x", 2), eu4("third", "1547-06-09", "h3", 2)],
        openEntry: first,
      });
      expect(saves.saves.map((x) => x.key)).toEqual(["local:first", "upload:u", "local:third"]);
    });

    it("keeps a usable save of the campaign over an unknown file of the same drop", () => {
      const known = eu4("known", "1600-01-01", "h1", 2, true);
      const saves = mergeCampaign({
        open: open("h1"),
        uploads: [{ ...upload("u", "1550-01-01"), game: "eu4" }],
        entries: [first, known, eu4("other", "1550-01-01", "x", 2)],
        openEntry: first,
      });
      expect(saves.saves.map((x) => x.key)).toEqual(["local:first", "upload:u", "local:known"]);
    });

    it("does not take files from before the campaign's first known save", () => {
      const later = eu4("open", "1580-10-21", "h4", 5, true);
      const saves = mergeCampaignSaves({
        open: { ...open("h4"), date: { year: 1580, month: 10, day: 21 } },
        uploads: [],
        entries: [eu4("earlier", "1450-01-01", "e", 4), later, eu4("added", "1602-03-16", "s", 6)],
        openEntry: later,
      });
      expect(saves.map((x) => x.key)).toEqual(["local:open", "local:added"]);
    });
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
  const p = toPlaythroughId("p");

  it("matches the server's key", () => {
    expect(campaignKeyFor({ playthroughId: p, multiplayer: true, userId: "u" })).toBe("p");
    expect(campaignKeyFor({ playthroughId: p, multiplayer: false, userId: "u" })).toBe("p:u");
  });

  it("has no key for a single-player save of an unknown user", () => {
    expect(campaignKeyFor({ playthroughId: p, multiplayer: false, userId: null })).toBeNull();
    expect(
      campaignKeyFor({ playthroughId: toPlaythroughId(""), multiplayer: true, userId: "u" }),
    ).toBeNull();
    expect(campaignKeyFor({ playthroughId: null, multiplayer: true, userId: "u" })).toBeNull();
  });
});

it("shows one open point at the parsed date before the local metadata is updated", () => {
  const local = entry("open", "1400-01-01");
  const saves = mergeCampaignSaves({
    open: openLocal("1450-01-01"),
    uploads: [upload("later", "1450-01-01")],
    entries: [local],
    openEntry: local,
  });
  expect(saves.map((save) => [save.key, save.date, save.isOpen])).toEqual([
    ["local:open", { year: 1450, month: 1, day: 1 }, true],
  ]);
});
