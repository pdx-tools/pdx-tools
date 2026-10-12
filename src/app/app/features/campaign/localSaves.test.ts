import { expect, it, vi } from "vitest";
import { createLocalSaveRegistry } from "./localSaves";
import { campaignMembership, toPlaythroughId } from "./types";
import type { LocalSaveRef, SaveIdentity } from "./types";

const identity = (year = 1400): SaveIdentity => ({
  playthroughId: toPlaythroughId("campaign"),
  campaignIdHint: null,
  date: { year, month: 1, day: 1 },
});

function handleRef(getFile: () => Promise<File>, id = 1, name = "autosave.eu5"): LocalSaveRef {
  const handle = {
    name,
    id,
    getFile,
    isSameEntry: async (other: { id: number }) => id === other.id,
  } as unknown as FileSystemFileHandle;
  return { kind: "handle", name: handle.name, file: handle };
}

it("registers overlapping selections as one entry", async () => {
  const registry = createLocalSaveRegistry(async () => identity());
  const ref: LocalSaveRef = { kind: "file", file: new File(["save"], "concurrent.eu5") };
  const [[first], [second]] = await Promise.all([
    registry.register("eu5", [ref]),
    registry.register("eu5", [ref]),
  ]);
  expect(second.id).toBe(first.id);
});

it("returns files in selection order", async () => {
  const registry = createLocalSaveRegistry(async () => identity());
  const refs: LocalSaveRef[] = Array.from({ length: 3 }, (_, i) => ({
    kind: "file",
    file: new File([String(i)], `batch-${i}.eu5`),
  }));
  const entries = await registry.register("eu5", refs);
  const repeated = await registry.register("eu5", refs.toReversed());
  expect(repeated.map((entry) => entry.id)).toEqual(entries.map((entry) => entry.id).toReversed());
});

it("uses the newly selected file to recover from an unreadable reference", async () => {
  const registry = createLocalSaveRegistry(async () => identity());
  const oldFile = new File(["save"], "retry.eu5", { lastModified: 1 });
  vi.spyOn(oldFile, "slice").mockImplementation(() => {
    throw new Error("File is gone");
  });
  const [entry] = await registry.register("eu5", [{ kind: "file", file: oldFile }]);
  expect(await registry.verify(entry.id)).toEqual({ kind: "missing" });
  const newFile = new File(["save"], "retry.eu5", { lastModified: 1 });
  const [selected] = await registry.register("eu5", [{ kind: "file", file: newFile }]);
  expect(selected.id).toBe(entry.id);
  expect(selected.ref.file).toBe(newFile);
  expect(await registry.verify(selected.id)).toBeNull();
  expect(registry.get(selected.id)?.problem).toBeNull();
});

it("distinguishes handles of the same name and reuses the same disk file", async () => {
  const registry = createLocalSaveRegistry(async () => identity());
  const getFile = async () => new File(["save"], "autosave.eu5");
  const [first] = await registry.register("eu5", [handleRef(getFile, 1)]);
  const [different, repeated] = await registry.register("eu5", [
    handleRef(getFile, 2),
    handleRef(getFile, 1),
  ]);
  expect(different.id).not.toBe(first.id);
  expect(repeated.id).toBe(first.id);
});

it("updates an overwritten handle before allowing a step to its new date", async () => {
  let file = new File(["1400"], "autosave.eu5", { lastModified: 1 });
  const registry = createLocalSaveRegistry(async (_, file) => identity(Number(await file.text())));
  const [entry] = await registry.register("eu5", [handleRef(async () => file)]);
  await registry.readIdentity(entry.id);
  file = new File(["1450"], "autosave.eu5", { lastModified: 2 });
  expect(await registry.verify(entry.id)).toEqual({ kind: "moved", from: identity().date });
  expect(registry.get(entry.id)?.identity?.date.year).toBe(1450);
  expect(await registry.verify(entry.id)).toBeNull();
  expect(registry.get(entry.id)?.problem).toBeNull();
});

it("keeps the parsed campaign identity when a metadata read finishes later", async () => {
  const pending = Promise.withResolvers<SaveIdentity>();
  const registry = createLocalSaveRegistry(() => pending.promise);
  const ref: LocalSaveRef = { kind: "file", file: new File(["save"], "open.eu5") };
  const [entry] = await registry.register("eu5", [ref]);
  const read = registry.readIdentity(entry.id);
  registry.observeOpen({
    ...identity(1450),
    game: "eu5",
    multiplayer: false,
    name: "open.eu5",
    source: registry.sourceFor("eu5", ref),
  });
  pending.resolve(identity());
  await read;
  expect(registry.get(entry.id)?.identity).toEqual(identity(1450));
});

it("reports an unreadable header and retries after another selection", async () => {
  const read = vi
    .fn()
    .mockRejectedValueOnce(new Error("Invalid header"))
    .mockResolvedValue(identity());
  const registry = createLocalSaveRegistry(read);
  const ref: LocalSaveRef = { kind: "file", file: new File(["save"], "retry.eu5") };
  const [entry] = await registry.register("eu5", [ref]);
  await registry.readIdentity(entry.id);
  expect(registry.get(entry.id)?.problem).toEqual({ kind: "unreadable" });
  await registry.register("eu5", [ref]);
  await registry.readIdentity(entry.id);
  expect(registry.get(entry.id)?.identity).toEqual(identity());
  expect(registry.get(entry.id)?.problem).toBeNull();
});

it("discards metadata from a read started before a handle was selected again", async () => {
  const oldRead = Promise.withResolvers<SaveIdentity>();
  const reader = vi
    .fn()
    .mockImplementationOnce(() => oldRead.promise)
    .mockResolvedValue(identity(1450));
  const registry = createLocalSaveRegistry(reader);
  const ref = handleRef(async () => new File(["save"], "autosave.eu5"));
  const [entry] = await registry.register("eu5", [ref]);
  const reading = registry.readIdentity(entry.id);
  await vi.waitFor(() => expect(reader).toHaveBeenCalled());
  await registry.register("eu5", [ref]);
  oldRead.resolve(identity());
  await reading;
  expect(registry.get(entry.id)?.identity).toEqual(identity(1450));
});

it("registers new handles without reading their files", async () => {
  const registry = createLocalSaveRegistry(async () => identity());
  const getFile = vi.fn(async () => {
    throw new Error("The disk read is blocked");
  });
  const entries = await registry.register("eu5", [handleRef(getFile, 1), handleRef(getFile, 2)]);
  expect(entries).toHaveLength(2);
  expect(getFile).not.toHaveBeenCalled();
});

it("keeps the exact EU4 identity when a previously opened handle is selected again unchanged", async () => {
  const header = { ...identity(), playthroughId: null, campaignIdHint: "early-session" };
  const registry = createLocalSaveRegistry(async () => header);
  const file = new File(["save"], "autosave.eu4", { lastModified: 1 });
  const ref = handleRef(async () => file, 1, file.name);
  const [entry] = await registry.register("eu4", [ref]);
  const opened = {
    ...identity(),
    campaignIdHint: header.campaignIdHint,
    game: "eu4" as const,
    multiplayer: false,
    name: file.name,
    source: registry.sourceFor("eu4", ref, file),
  };
  registry.observeOpen(opened);
  const nextFile = new File(["next save"], "later.eu4", { lastModified: 2 });
  const nextRef = handleRef(async () => nextFile, 2, nextFile.name);
  await registry.register("eu4", [nextRef]);
  const later = {
    ...opened,
    date: { year: 1500, month: 1, day: 1 },
    campaignIdHint: "late-session",
    name: nextFile.name,
    source: registry.sourceFor("eu4", nextRef, nextFile),
  };
  registry.observeOpen(later);
  await registry.register("eu4", [handleRef(async () => file, 1, file.name)]);
  await registry.readIdentity(entry.id);
  expect(registry.get(entry.id)?.identity?.playthroughId).toBe(opened.playthroughId);
  expect(campaignMembership(registry.get(entry.id)!.identity!, later)).toBe("same");
});

it("drops a previously opened EU4 identity when the selected handle has changed", async () => {
  let file = new File(["1400"], "autosave.eu4", { lastModified: 1 });
  const registry = createLocalSaveRegistry(async (_, file) => ({
    ...identity(Number(await file.text())),
    playthroughId: null,
    campaignIdHint: "new-session",
  }));
  const ref = handleRef(async () => file, 1, file.name);
  const [entry] = await registry.register("eu4", [ref]);
  registry.observeOpen({
    ...identity(),
    game: "eu4",
    multiplayer: false,
    name: file.name,
    source: registry.sourceFor("eu4", ref, file),
  });
  file = new File(["1500"], "autosave.eu4", { lastModified: 2 });
  await registry.register("eu4", [ref]);
  await registry.readIdentity(entry.id);
  expect(registry.get(entry.id)?.identity?.playthroughId).toBeNull();
  expect(registry.get(entry.id)?.identity?.date.year).toBe(1500);
});
