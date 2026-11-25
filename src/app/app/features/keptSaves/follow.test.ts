import { describe, expect, it } from "vitest";
import { decideFollow, isFarEnough } from "./follow";
import type { FollowInput } from "./follow";
import { IDLE_WATCH, indexKept, latestInCampaign } from "./keptStore";
import { watchStatus } from "./status";
import { formatBytes, roomText, saveDateText } from "./text";
import { DEFAULT_SETTINGS, UNKNOWN_IDENTITY } from "./types";
import type { KeptSave, SaveWrite, WatchConfig } from "./types";
import type { CampaignSave, PlaythroughId } from "@/features/campaign/types";

const date = (year: number, month = 1, day = 1) => ({ year, month, day });

const input = (change: Partial<FollowInput> = {}): FollowInput => ({
  armed: true,
  pace: "Monthly",
  open: date(1444),
  next: date(1444, 2),
  afterLatest: false,
  isProtected: false,
  isBusy: false,
  ...change,
});

describe("decideFollow", () => {
  it("opens a write that is far enough", () => {
    expect(decideFollow(input())).toBe("open");
  });
  it("offers a write while an older save is open", () => {
    expect(decideFollow(input({ armed: false, isProtected: true }))).toBe("offer");
  });
  it("skips a write that is too soon, and the first write after Latest is never too soon", () => {
    const soon = { next: date(1444, 1, 20) };
    expect(decideFollow(input(soon))).toBe("skip");
    expect(decideFollow(input({ ...soon, isProtected: true }))).toBe("skip");
    expect(decideFollow(input({ ...soon, afterLatest: true }))).toBe("open");
  });
  it("ends the following during protected work, and only waits for a short interaction", () => {
    expect(decideFollow(input({ isProtected: true, isBusy: true }))).toBe("disarm");
    expect(decideFollow(input({ isBusy: true }))).toBe("wait");
  });
});

it("measures the pace from the open save, and lets an earlier or equal date pass", () => {
  expect(isFarEnough("Yearly", date(1444), date(1444, 12))).toBe(false);
  expect(isFarEnough("Yearly", date(1444, 12), date(1445))).toBe(true);
  expect(isFarEnough("Daily", date(1444), date(1444, 1, 2))).toBe(true);
  expect(isFarEnough("Yearly", date(1444, 6), date(1444, 6))).toBe(true);
  expect(isFarEnough("Yearly", date(1444, 6), date(1444, 5))).toBe(true);
});

const write = (hash: string, seq: number, day: ReturnType<typeof date>): SaveWrite => ({
  ...UNKNOWN_IDENTITY,
  hash,
  game: "eu4",
  seq,
  writtenAt: seq,
  name: "a.eu4",
  session: "s",
  playthroughId: "campaign" as PlaythroughId,
  date: day,
});

it("finds the last write by its order and not by its date", () => {
  const writes = [write("later", 1, date(1500)), write("earlier", 2, date(1444))];
  const index = indexKept([], writes, []);
  expect(latestInCampaign(index, "eu4", "campaign", null)?.hash).toBe("earlier");
  expect(latestInCampaign(index, "eu4", "other", null)).toBeNull();
  expect(index.wentBack.get("earlier")?.hash).toBe("later");
  expect(index.wentBack.get("later")).toBeUndefined();
  const otherRun = [{ ...writes[0], session: "before" }, writes[1]];
  expect(indexKept([], otherRun, []).wentBack.size).toBe(0);
});

it("counts the content on screen to its campaign before its write is identified", () => {
  const open = { ...write("open", 2, date(1444)), ...UNKNOWN_IDENTITY };
  const index = indexKept([], [write("older", 1, date(1440)), open], []);
  expect(latestInCampaign(index, "eu4", "campaign", "open")?.hash).toBe("open");
});

describe("watchStatus", () => {
  const save = { game: "eu4", size: 1e9, keptAt: 1 } as KeptSave;
  const config = { game: "eu4", id: "w", keep: true, wasWatching: true } as WatchConfig;
  const state = (
    phase: (typeof IDLE_WATCH)["phase"],
    { limit = 100e9, keep = true, missed = [] as never[] } = {},
  ) => ({
    live: { eu4: { ...IDLE_WATCH, phase }, eu5: IDLE_WATCH },
    watches: {
      eu4: { ...config, keep, handle: { name: "save games" } as FileSystemDirectoryHandle },
    },
    folders: {
      eu4: { game: "eu4" as const, watchId: "w", newest: [], manifest: [], missed },
    },
    missing: new Set<string>(),
    saves: [save],
    settings: { ...DEFAULT_SETTINGS, limit },
    storage: { available: 1e15, persisted: false },
  });
  const disk = [{ path: "a", size: 1, mtime: 1, hash: "a", reason: "disk" }] as never[];
  const view = { failed: date(1547, 3, 5), loading: date(1500) };

  it.each([
    ["no-access", state("no-access", { missed: disk })],
    ["not-found", state("not-found", { missed: disk })],
    ["disk", state("watching", { missed: disk, limit: 1 })],
    ["limit", state("watching", { limit: 1 })],
    ["failed", state("watching", { limit: 5e9 })],
  ])("says %s before lesser things", (kind, kept) => {
    expect(watchStatus("eu4", kept, view).kind).toBe(kind);
  });

  it.each([
    ["near-limit", state("elsewhere", { limit: 5e9 })],
    ["elsewhere", state("elsewhere")],
    ["paused", state("paused")],
    ["loading", state("watching")],
  ])("says %s before lesser things when nothing failed", (kind, kept) => {
    expect(watchStatus("eu4", kept, { ...view, failed: null }).kind).toBe(kind);
  });

  it("names a limit in the title, and no limit when copies are off", () => {
    expect(watchStatus("eu4", state("watching", { limit: 5e9 })).titlePrefix).toBe(
      "Room for 4 saves - ",
    );
    const off = watchStatus("eu4", state("watching", { limit: 1, keep: false }));
    expect(off).toMatchObject({ text: "Watching, not keeping", isWarning: false });
    expect(watchStatus("eu5", state("watching")).text).toBe("Watch save");
  });
});

it("formats sizes, room and dates", () => {
  expect([4.7e6, 154e6, 9.49e9, 10e9, 500].map(formatBytes)).toEqual([
    "4.7 MB",
    "154 MB",
    "9.49 GB",
    "10 GB",
    "1 KB",
  ]);
  expect(roomText(2137, "more")).toBe("about 2,100 more saves");
  expect(roomText(1, "more")).toBe("1 more save");
  const a = { key: "a", date: date(1528), writtenAt: new Date(2026, 1, 1, 21, 52).getTime() };
  const b = { ...a, key: "b" };
  const c = { ...a, key: "c", date: date(1529) };
  const saves = [a, b, c] as CampaignSave[];
  expect(saves.map((save) => saveDateText(save, saves))).toEqual([
    "1528 Jan 1, 21:52",
    "1528 Jan 1, 21:52",
    "1529 Jan 1",
  ]);
});
