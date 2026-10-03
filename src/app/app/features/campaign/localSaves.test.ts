import { expect, it, vi } from "vitest";
import {
  beginCampaignOpening,
  getLocalSave,
  registerLocalSaves,
  setCampaignOpening,
  setLocalSaveHeader,
  setLocalSaveProblem,
} from "./localSaves";
import type { LocalSaveRef } from "./types";

it("does not release a newer step when an earlier step ends", () => {
  const finishPrevious = beginCampaignOpening("previous");
  expect(finishPrevious).not.toBeNull();
  setCampaignOpening(null);
  const finishNext = beginCampaignOpening("next");
  expect(finishNext).not.toBeNull();
  finishPrevious?.();
  expect(beginCampaignOpening("other")).toBeNull();
  finishNext?.();
});

it("registers overlapping batches without duplicate entries", async () => {
  const ref: LocalSaveRef = { kind: "file", file: new File(["save"], "concurrent.eu5") };
  const [[first], [second]] = await Promise.all([
    registerLocalSaves("eu5", [ref]),
    registerLocalSaves("eu5", [ref]),
  ]);
  expect(second.id).toBe(first.id);
  expect(second.batch).toBe(first.batch + 1);
});

it("returns files in input order and clears their previous problems", async () => {
  const refs: LocalSaveRef[] = Array.from({ length: 100 }, (_, i) => ({
    kind: "file",
    file: new File([String(i)], `batch-${i}.eu5`),
  }));
  const entries = await registerLocalSaves("eu5", refs);
  setLocalSaveProblem(entries[50].id, { kind: "missing" });
  const repeated = await registerLocalSaves("eu5", refs.toReversed());
  expect(repeated.map((entry) => entry.id)).toEqual(entries.map((entry) => entry.id).toReversed());
  expect(getLocalSave(entries[50].id)?.problem).toBeNull();
});

it("checks browser identity for handles with the same name", async () => {
  const makeHandle = (id: number) => ({
    kind: "file",
    name: "autosave.eu5",
    id,
    isSameEntry: vi.fn(async (other: { id: number }) => id === other.id),
  });
  const first = makeHandle(1);
  const other = makeHandle(2);
  const repeated = makeHandle(1);
  const ref = (file: ReturnType<typeof makeHandle>): LocalSaveRef => ({
    kind: "handle",
    name: file.name,
    file: file as unknown as FileSystemFileHandle,
  });
  const [entry] = await registerLocalSaves("eu5", [ref(first)]);
  const [different, same] = await registerLocalSaves("eu5", [ref(other), ref(repeated)]);
  expect(different.id).not.toBe(entry.id);
  expect(same.id).toBe(entry.id);
  expect(repeated.isSameEntry).toHaveBeenCalled();
});

it("keeps a header that arrives while a batch checks browser identity", async () => {
  const comparison = Promise.withResolvers<boolean>();
  const handle = {
    name: "header-race.eu5",
    isSameEntry: vi.fn(() => comparison.promise),
  } as unknown as FileSystemFileHandle;
  const [entry] = await registerLocalSaves("eu5", [
    { kind: "handle", file: handle, name: handle.name },
  ]);
  const repeated = {
    name: handle.name,
    isSameEntry: vi.fn(() => comparison.promise),
  } as unknown as FileSystemFileHandle;
  const result = registerLocalSaves("eu5", [
    { kind: "handle", file: repeated, name: repeated.name },
  ]);
  await vi.waitFor(() => expect(repeated.isSameEntry).toHaveBeenCalled());
  const header = { playthroughId: null, date: { year: 1400, month: 1, day: 1 } };
  setLocalSaveHeader(entry.id, header);
  comparison.resolve(true);
  expect((await result)[0].header).toEqual(header);
  expect(getLocalSave(entry.id)?.header).toEqual(header);
});
