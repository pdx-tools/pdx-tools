import { beforeEach, expect, it, vi } from "vitest";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import type { CampaignSave } from "@/features/campaign/types";
import type { Eu4SnapshotDescriptor } from "./analysisTypes";

const mocks = vi.hoisted(() => ({ entries: new Map<string, LocalSaveEntry>() }));
vi.mock("@/features/campaign/localSaves", () => ({
  localSaveRegistry: { get: (id: string) => mocks.entries.get(id) },
}));
import { analysisSaves, pendingEntries } from "./campaignSaves";

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
const snapshot = (id: string) => ({ id, campaignId: "campaign" }) as Eu4SnapshotDescriptor;
const empty = { snapshots: [], sources: {}, failedSources: {}, analyzingEntryIds: [] };

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
