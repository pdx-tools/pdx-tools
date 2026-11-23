import { expect, it } from "vitest";
import type { SnapshotDescriptor } from "./descriptor";
import {
  markKept,
  mergeRestored,
  persistRequest,
  pickIndex,
  sealIndex,
  storeFooter,
} from "./campaignStore";
import type { CampaignIndexContent } from "./campaignStore";

const content = (nextSeq: number): CampaignIndexContent => ({
  format: 1,
  game: "eu4",
  playthroughId: "c",
  keepFiles: false,
  nextSeq,
  sessions: [{ id: "s", fileName: "autosave.eu4", startedSeq: 0 }],
  points: [
    {
      id: "a",
      seq: 0,
      date: { year: 1510, month: 1, day: 1 },
      parent: null,
      session: "s",
      source: { kind: "watched", name: "autosave.eu4" },
      sourceKeys: [],
      snapshot: { file: "a.gz", encoder: 257, bytes: 10 },
      saveFile: null,
    },
  ],
});

it("loads the newest copy of the index whose checksum holds", async () => {
  const older = JSON.stringify(await sealIndex(content(1), 1));
  const newer = JSON.stringify(await sealIndex(content(2), 2));
  expect((await pickIndex([older, newer]))?.nextSeq).toBe(2);
  // A copy cut short by a crash, or changed on disk, is passed over.
  expect((await pickIndex([older, newer.slice(0, 40)]))?.nextSeq).toBe(1);
  expect((await pickIndex([older, newer.replace('"nextSeq":2', '"nextSeq":3')]))?.nextSeq).toBe(1);
  // No valid copy: the campaign's points cannot be read, and are never written over.
  expect(await pickIndex(["{", null])).toBeNull();
});

it("puts the points of earlier visits before this visit's", () => {
  const today = { id: "b", campaignId: "c", dateSort: 15200101 } as SnapshotDescriptor;
  const merged = mergeRestored(
    {
      snapshots: [today],
      points: { b: { seq: 0, parent: null, session: null, sourceKeys: [] } },
      sessions: {},
      nextSeq: 1,
    },
    content(5),
    [{ id: "a", campaignId: "c", dateSort: 15100101 } as SnapshotDescriptor],
  );
  expect(merged.snapshots.map((x) => x.id)).toEqual(["a", "b"]);
  expect(merged.points.a).toMatchObject({ seq: 0, session: "s" });
  expect(merged.points.b.seq).toBe(5);
  expect(merged.nextSeq).toBe(6);
  // The run of an earlier visit belongs to no file of this tab.
  expect(merged.sessions.s).toEqual({ entryId: null, fileName: "autosave.eu4", restored: true });
});

it("keeps only the watch runs that a kept point belongs to", () => {
  const request = persistRequest(
    {
      snapshots: [{ id: "a", campaignId: "c", dateSort: 15100101 } as SnapshotDescriptor],
      points: { a: { seq: 3, parent: null, session: "now", sourceKeys: [] } },
      sessions: {
        now: { entryId: "local-1", fileName: "autosave.eu4" },
        // An earlier visit's run whose points were forgotten.
        gone: { entryId: null, fileName: "old.eu4", restored: true },
      },
      uploads: {},
      nextSeq: 4,
    },
    "c",
  );
  expect(request.sessions).toEqual([{ id: "now", fileName: "autosave.eu4", startedSeq: 3 }]);
});

it("keeps the source of an upload of an earlier visit", () => {
  const kept = content(1);
  kept.points[0] = { ...kept.points[0], session: null, source: { kind: "upload", saveId: "u" } };
  const merged = mergeRestored({ snapshots: [], points: {}, sessions: {}, nextSeq: 0 }, kept, [
    { id: "a", campaignId: "c", dateSort: 15100101 } as SnapshotDescriptor,
  ]);
  // The upload was not downloaded again this visit.
  const request = persistRequest({ ...merged, uploads: {} }, "c");
  expect(request.points[0].source).toEqual({ kind: "upload", saveId: "u" });
});

it("marks the points that the store wrote, once", () => {
  const points = { a: { seq: 0, parent: null, session: null, sourceKeys: [] } };
  const marked = markKept(points, ["a", "gone"]);
  expect(marked.a.kept).toBe(true);
  expect(markKept(marked, ["a"])).toBe(marked);
});

it("says the store is full also when it could keep nothing", () => {
  const stored = {
    campaignId: "c",
    generation: 1,
    state: "full" as const,
    missing: 0,
    kept: 0,
  };
  expect(storeFooter(stored)).toEqual({
    unreadable: false,
    kept: false,
    full: true,
    forget: false,
  });
  expect(storeFooter({ ...stored, state: "ready" })).toBeNull();
});
