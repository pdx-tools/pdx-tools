import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import type { CampaignSave } from "@/features/campaign/types";
import type { Eu4SnapshotDescriptor } from "./analysisTypes";

const mocks = vi.hoisted(() => ({ entries: new Map<string, LocalSaveEntry>() }));
vi.mock("@/features/campaign/localSaves", () => ({
  localSaveRegistry: { get: (id: string) => mocks.entries.get(id) },
}));
import {
  analysisSaves,
  campaignPoints,
  figuresKey,
  onePath,
  pendingEntries,
  pointKey,
  pendingUploads,
  replacedSnapshots,
} from "./campaignSaves";
import type { AnalysisSave } from "./campaignSaves";

const entry = (id: string, lastModified = 1): LocalSaveEntry => ({
  id,
  game: "eu4",
  name: `${id}.eu4`,
  identity: null,
  version: { size: 4, lastModified },
  problem: null,
  batch: 0,
  ref: { kind: "file", file: new File(["save"], `${id}.eu4`, { lastModified }) },
});
const local = (id: string, membership: CampaignSave["membership"] = "unknown"): CampaignSave => ({
  key: `local:${id}`,
  date: { year: 1444, month: 11, day: 11 },
  name: `${id}.eu4`,
  isOpen: false,
  source: { kind: "local", entryId: id, uploadedBy: null },
  membership,
  problem: null,
});
const snapshot = (id: string) =>
  ({ id, campaignId: "campaign", dateSort: 14441111 }) as Eu4SnapshotDescriptor;
const empty = {
  snapshots: [],
  sources: {},
  failedSources: {},
  analyzingEntryIds: [],
  uploads: {},
  analyzingUploadIds: [],
  points: {},
};
const upload = (id: string): CampaignSave => ({
  ...local(id),
  key: `upload:${id}`,
  source: { kind: "upload", saveId: id, uploaderId: null, userName: "nick" },
  membership: "same",
});

beforeEach(() => {
  mocks.entries = new Map(["a", "b", "other"].map((id) => [id, entry(id)]));
});

it("reads the saves of the campaign list and leaves out those of another campaign", () => {
  const saves = [local("a", "same"), local("b"), local("other", "different")];
  expect(pendingEntries(saves, empty).map((x) => x.id)).toEqual(["a", "b"]);
  expect(
    analysisSaves(saves, empty, [...mocks.entries.values()]).map((x) => [x.save.key, x.status]),
  ).toEqual([
    ["local:a", "pending"],
    ["local:b", "pending"],
  ]);
});

it("binds a snapshot only to the file version that analysis read", () => {
  const state = {
    ...empty,
    snapshots: [snapshot("eu4:a")],
    sources: { a: { snapshotId: "eu4:a", version: { size: 4, lastModified: 1 } } },
    failedSources: { b: { version: { size: 4, lastModified: 1 }, error: "bad save" } },
  };
  const saves = [local("a"), local("b")];
  expect(pendingEntries(saves, state).map((x) => x.id)).toEqual(["b"]);
  expect(analysisSaves(saves, state, [...mocks.entries.values()])).toMatchObject([
    { status: "ready", snapshot: { id: "eu4:a" }, error: null },
    { status: "failed", snapshot: null, error: "bad save" },
  ]);

  // A changed file drops its dot and waits for analysis again.
  mocks.entries.set("a", entry("a", 2));
  expect(analysisSaves(saves, state, [...mocks.entries.values()])[0]).toMatchObject({
    status: "pending",
    snapshot: null,
  });
  expect(pendingEntries(saves, state).map((x) => x.id)).toEqual(["a", "b"]);
});

it("downloads an upload again only after a failed download", () => {
  const saves = [upload("ready"), upload("lost"), upload("broken"), upload("new")];
  const state = {
    ...empty,
    snapshots: [snapshot("eu4:ready")],
    uploads: {
      ready: { kind: "ready", snapshotId: "eu4:ready" },
      lost: { kind: "failed", reason: "download", error: "offline" },
      broken: { kind: "failed", reason: "read", error: "bad save" },
    } as const,
  };
  expect(pendingUploads(saves, state).map((x) => x.saveId)).toEqual(["lost", "new"]);
  expect(analysisSaves(saves, state, []).map((x) => [x.status, x.retry])).toEqual([
    ["ready", false],
    ["failed", true],
    ["failed", false],
    ["pending", false],
  ]);
});

it("replaces the snapshot of a date whose save is now another file", () => {
  const state = {
    ...empty,
    snapshots: [snapshot("eu4:a")],
    sources: { a: { snapshotId: "eu4:a", version: { size: 4, lastModified: 1 } } },
  };
  expect(replacedSnapshots([local("a")], state)).toEqual([]);
  // The game wrote the file again on the same date.
  mocks.entries.set("a", entry("a", 2));
  expect(replacedSnapshots([local("a")], state)).toEqual(["eu4:a"]);
  // The list now keeps another file for the date.
  mocks.entries.set("a", entry("a"));
  expect(replacedSnapshots([local("b")], state)).toEqual(["eu4:a"]);
  // A watched write stays: the game wrote over its file.
  const watched = { seq: 0, parent: null, session: "s", sourceKeys: [] };
  expect(replacedSnapshots([local("b")], { ...state, points: { "eu4:a": watched } })).toEqual([]);
});

it("replaces a snapshot on the date of the file now, not of the open save", () => {
  const state = {
    ...empty,
    snapshots: [{ ...snapshot("eu4:a"), dateSort: 14500101 }],
    sources: { a: { snapshotId: "eu4:a", version: { size: 4, lastModified: 1 } } },
  };
  // The list keeps the viewer's date for the open save; the file is newer.
  mocks.entries.set("a", {
    ...entry("a", 2),
    identity: { playthroughId: null, campaignIdHint: null, date: { year: 1450, month: 1, day: 1 } },
  });
  expect(replacedSnapshots([{ ...local("a"), isOpen: true }], state)).toEqual(["eu4:a"]);
});

describe("a watched campaign that went back", () => {
  // The game wrote a, b and c, then went back to a and wrote d.
  const watched = (seq: number, parent: string | null) => ({
    seq,
    parent,
    session: "s",
    sourceKeys: [{ name: "autosave.eu4", size: 1, lastModified: seq }],
  });
  const state = {
    ...empty,
    snapshots: [
      { ...snapshot("drop"), dateSort: 15000101 },
      { ...snapshot("a"), dateSort: 15100101 },
      { ...snapshot("b"), dateSort: 15110101 },
      { ...snapshot("c"), dateSort: 15120101 },
      { ...snapshot("d"), dateSort: 15100601 },
    ],
    // The watched file holds d now, and the player uploaded b.
    sources: { w: { snapshotId: "d", version: { size: 1, lastModified: 4 } } },
    uploads: { u: { kind: "ready" as const, snapshotId: "b" } },
    sessions: { s: { entryId: "w", fileName: "autosave.eu4" } },
    points: {
      drop: { seq: 0, parent: null, session: null, sourceKeys: [] },
      a: watched(1, null),
      b: watched(2, "a"),
      c: watched(3, "b"),
      d: watched(4, "a"),
    },
  };
  const figures = (id: string) =>
    ({
      save: { key: figuresKey(id), source: { kind: "figures", snapshotId: id } },
      snapshot: { id },
    }) as AnalysisSave;
  const held = (key: string, source: CampaignSave["source"], id: string) =>
    ({ save: { ...local(key), key, source }, snapshot: { id } }) as AnalysisSave;
  // The watched file holds d, and the player uploaded the state b.
  const list = [
    figures("drop"),
    figures("a"),
    figures("c"),
    held("upload:u", { kind: "upload", saveId: "u", uploaderId: null, userName: "" }, "b"),
    held("local:w", { kind: "local", entryId: "w", uploadedBy: null }, "d"),
  ];
  const shown = (selected: string | null, from = list) =>
    onePath(from, state, selected).map((x) => x.save.key);

  it("names why each point no file holds has figures only", () => {
    const reasons = campaignPoints([], state, "campaign").map((x) =>
      x.source.kind === "figures" ? [x.source.snapshotId, x.source.reason] : [],
    );
    expect(reasons).toEqual([
      ["drop", "notOpen"],
      ["a", "writtenOver"],
      ["c", "otherBranch"],
    ]);
  });

  it("draws the game's current path, or the whole branch of a selected point", () => {
    const current = ["figures:drop", "figures:a", "upload:u", "local:w"];
    expect(shown(null)).toEqual(current);
    expect(shown("figures:a")).toEqual(current);
    // An upload joins by date on every path. The file that the run wrote follows the
    // current path, also after the watch stopped.
    expect(shown("figures:c")).toEqual(["figures:drop", "figures:a", "figures:c", "upload:u"]);
  });

  it("selects the save that shows a point", () => {
    expect(pointKey(state, "d")).toBe("local:w");
    expect(pointKey(state, "b")).toBe("upload:u");
    expect(pointKey(state, "c")).toBe(figuresKey("c"));
  });

  it("draws the current path again from a branch that shares no point with it", () => {
    const apart = { ...state, points: { ...state.points, d: { ...state.points.d, parent: null } } };
    const path = (selected: string | null) => onePath(list, apart, selected).map((x) => x.save.key);
    expect(path("figures:c")).toEqual(["figures:drop", "figures:a", "figures:c", "upload:u"]);
    expect(path(null)).toEqual(["figures:drop", "upload:u", "local:w"]);
  });

  it("finds the end of a branch on a long run", () => {
    // 2000 monthly writes, then the game went back to the 1000th and wrote 3 more.
    const run = 2000;
    const id = (i: number) => `w${i}`;
    const long = {
      ...empty,
      snapshots: [] as Eu4SnapshotDescriptor[],
      points: {} as Record<string, (typeof state.points)["a"]>,
      sessions: state.sessions,
    };
    const add = (key: string, seq: number, parent: string | null, dateSort: number) => {
      long.snapshots.push({ ...snapshot(key), dateSort });
      long.points[key] = { seq, parent, session: "s", sourceKeys: [] };
    };
    for (let i = 0; i < run; i++) add(id(i), i, i ? id(i - 1) : null, 15000101 + i);
    for (let i = 0; i < 3; i++) add(`b${i}`, run + i, i ? `b${i - 1}` : id(1000), 15001101 + i);
    const keys = ["w1500", "w1999", "b1", "b2"].map((key) => figures(key));
    const path = onePath(keys, long, figuresKey("w1500")).map((x) => x.snapshot!.id);
    expect(path).toEqual(["w1500", "w1999"]);
  });
});
