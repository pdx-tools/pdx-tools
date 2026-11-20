import { beforeEach, expect, it, vi } from "vitest";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import type { CampaignSave } from "@/features/campaign/types";
import type { Eu4SnapshotDescriptor } from "./analysisTypes";

const mocks = vi.hoisted(() => ({ entries: new Map<string, LocalSaveEntry>() }));
vi.mock("@/features/campaign/localSaves", () => ({
  localSaveRegistry: { get: (id: string) => mocks.entries.get(id) },
}));
import { analysisSaves, pendingEntries, pendingUploads, replacedSnapshots } from "./campaignSaves";

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
});
