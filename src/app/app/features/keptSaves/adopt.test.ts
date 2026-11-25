import { expect, it, vi } from "vitest";
import { createLocalSaveRegistry } from "@/features/campaign/localSaves";
import type { KeptCopy } from "@/features/campaign/useCampaignNav";
import { toPlaythroughId } from "@/features/campaign/types";
import type { LocalSaveRef, OpenSave } from "@/features/campaign/types";
import { adoptKeptCopy } from "./adopt";
import type { KeptSave } from "./types";

const date = { year: 1444, month: 11, day: 11 };
const campaign = toPlaythroughId("campaign");

const handleOf = (name: string) =>
  ({
    name,
    getFile: async () => new File(["save"], name),
    isSameEntry: async () => false,
  }) as unknown as FileSystemFileHandle;

const kept = (hash: string): KeptSave => ({
  hash,
  game: "eu4",
  identity: "ok",
  playthroughId: campaign,
  campaignIdHint: null,
  date,
  flag: null,
  countryName: null,
  name: "ironman.eu4",
  names: ["ironman.eu4"],
  size: 4,
  writtenAt: 1,
  keptAt: 1,
  uploadedId: null,
  opfsModified: 1,
  watchId: "watch",
});

async function openFile(hash: string | null) {
  const registry = createLocalSaveRegistry(async () => ({
    playthroughId: campaign,
    campaignIdHint: null,
    date,
  }));
  const ref: LocalSaveRef = {
    kind: "handle",
    file: handleOf("ironman.eu4"),
    name: "ironman.eu4",
  };
  const [entry] = await registry.register("eu4", [ref]);
  const open: OpenSave = {
    game: "eu4",
    playthroughId: campaign,
    campaignIdHint: null,
    multiplayer: false,
    date,
    name: "ironman.eu4",
    source: registry.sourceFor("eu4", ref, null, hash),
  };
  registry.observeOpen(open);
  const copy = handleOf("a");
  const services = { registry, handleOf: async () => copy };
  return { registry, ref, entry, open, copy, services };
}

it("points every holder of the open save at the copy, and keeps its entry", async () => {
  const { registry, ref, entry, open, copy, services } = await openFile("a");
  await registry.syncKept([kept("a")], async () => copy);
  const adopt = vi.fn(async ({ commit }: KeptCopy) => {
    commit();
    return true;
  });
  expect(await adoptKeptCopy(open, kept("a"), { adopt }, services)).toBe(true);
  const adopted = registry.get(entry.id)!;
  expect(adopted).toMatchObject({ name: "ironman.eu4", hash: "a", kept: { hash: "a" } });
  expect(adopted.ref).toMatchObject({ kind: "handle", file: copy, name: "ironman.eu4" });
  expect(registry.sourceFor("eu4", adopted.ref).entryId).toBe(entry.id);
  // The next write of the game file is another save.
  expect(registry.sourceFor("eu4", ref).entryId).toBeNull();
  expect(await adoptKeptCopy(open, kept("a"), { adopt }, services)).toBe(false);
  expect(adopt).toHaveBeenCalledOnce();

  await registry.syncKept([kept("a")], async () => copy);
  expect(registry.findKept("a")?.id).toBe(entry.id);
});

it("does nothing when the open save has other bytes, or unknown bytes", async () => {
  for (const hash of ["b", null]) {
    const { registry, entry, open, services } = await openFile(hash);
    const adopt = vi.fn();
    expect(await adoptKeptCopy(open, kept("a"), { adopt }, services)).toBe(false);
    expect(adopt).not.toHaveBeenCalled();
    expect(registry.get(entry.id)?.kept).toBeNull();
  }
});

it("does not change the list when the view refuses the copy", async () => {
  const { registry, ref, entry, open, services } = await openFile("a");
  expect(await adoptKeptCopy(open, kept("a"), { adopt: async () => false }, services)).toBe(false);
  expect(registry.get(entry.id)?.ref).toEqual(ref);
});

it("records the content of a file only for the version that was read", async () => {
  const { registry, entry } = await openFile(null);
  const version = { size: 4, lastModified: 7 };
  registry.recordIdentity(
    entry.id,
    { playthroughId: campaign, campaignIdHint: null, date },
    version,
  );
  registry.recordHash(entry.id, { size: 4, lastModified: 8 }, "b");
  expect(registry.get(entry.id)?.hash).toBeNull();
  registry.recordHash(entry.id, version, "a");
  expect(registry.get(entry.id)?.hash).toBe("a");
});

it("does not compare a picked file with each copy of its name", async () => {
  const { registry } = await openFile(null);
  const copies = ["a", "b", "c"].map((hash) => kept(hash));
  await registry.syncKept(copies, async () => handleOf("copy"));
  const file = handleOf("ironman.eu4");
  const same = vi.spyOn(file, "isSameEntry");
  await registry.register("eu4", [{ kind: "handle", file, name: "ironman.eu4" }]);
  // Only the open file has this name on disk.
  expect(same).toHaveBeenCalledOnce();
});

it("removes the entry of a deleted copy, and reports a missing one", async () => {
  const { registry, copy } = await openFile(null);
  await registry.syncKept([kept("a")], async () => copy);
  const entry = registry.findKept("a")!;
  expect(await registry.verify(entry.id)).toBeNull();
  copy.getFile = async () => {
    throw new DOMException("gone", "NotFoundError");
  };
  expect(await registry.verify(entry.id)).toEqual({ kind: "copy-missing" });
  await registry.syncKept([], async () => copy);
  expect(registry.get(entry.id)).toBeUndefined();
});

it("pairs an upload only with the bytes that were sent", async () => {
  const { registry, ref, entry } = await openFile("a");
  const sent = registry.get(entry.id)!;
  // The game writes over the file, and the player opens it again.
  registry.recordIdentity(
    entry.id,
    { playthroughId: campaign, campaignIdHint: null, date },
    { size: 5, lastModified: 9 },
    "b",
  );
  registry.recordUpload(sent, "a", "upload");
  expect(registry.entryOf("eu4", ref)?.uploadedId).toBeNull();

  registry.recordUpload(registry.get(entry.id)!, "b", "upload-b");
  expect(registry.get(entry.id)?.uploadedId).toBe("upload-b");
  registry.recordIdentity(
    entry.id,
    { playthroughId: campaign, campaignIdHint: null, date },
    { size: 6, lastModified: 10 },
    "c",
  );
  expect(registry.get(entry.id)?.uploadedId).toBeNull();
});

it("pairs an upload with the copy that the save moved to during it", async () => {
  const { registry, entry, copy } = await openFile(null);
  // The view does not know the hash at submit.
  const sent = registry.get(entry.id)!;
  const ref = { kind: "handle", file: copy, name: "ironman.eu4" } as const;
  registry.adopt(entry.id, kept("a"), ref);
  registry.recordUpload(sent, "a", "upload");
  expect(registry.get(entry.id)?.uploadedId).toBe("upload");
  expect(registry.findKept("a")?.id).toBe(entry.id);
});
