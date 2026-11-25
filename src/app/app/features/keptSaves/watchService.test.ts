import { expect, it, vi } from "vitest";

vi.mock("@/features/campaign/reader", () => ({ readKeptIdentity: vi.fn() }));
const registry = vi.hoisted(() => ({
  register: vi.fn(async (_: string, [{ file }]: { file: File }[]) => [{ id: file.name }]),
  recordIdentity: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/features/campaign/localSaves", () => ({ localSaveRegistry: registry }));
vi.mock("./env", () => ({ keptEnv: {} }));
import { coalesce, holdSnapshot } from "./watchService";
import { beginUpload } from "./ui";

vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));

it("reads one at a time, and a call during a read gets a later read", async () => {
  let stored = 1;
  const published: number[] = [];
  const gates: (() => void)[] = [];
  const refresh = coalesce(async () => {
    const value = stored;
    await new Promise<void>((resolve) => gates.push(resolve));
    published.push(value);
  });
  const first = refresh();
  stored = 2;
  // Every call during the read shares one more read.
  const later = [refresh(), refresh(), refresh()];
  expect(gates).toHaveLength(1);
  gates[0]();
  await vi.waitFor(() => expect(gates).toHaveLength(2));
  gates[1]();
  await Promise.all([first, ...later]);
  expect(published).toEqual([1, 2]);
});

it("reads again after a failed read", async () => {
  const read = vi.fn(async () => {});
  read.mockRejectedValueOnce(new Error("The database is closed"));
  const refresh = coalesce(read);
  await expect(refresh()).rejects.toThrow("closed");
  await refresh();
  expect(read).toHaveBeenCalledTimes(2);
});

it("lets one upload run", () => {
  const end = beginUpload();
  expect(end).not.toBeNull();
  expect(beginUpload()).toBeNull();
  end!();
  expect(beginUpload()).not.toBeNull();
});

it("does not let an earlier write replace the last one", async () => {
  const snapshot = (hash: string, seq: number) => ({
    game: "eu4" as const,
    hash,
    seq,
    file: new File([hash], hash),
    identity: { date: { year: 1444, month: 11, day: 11 } },
  });
  await holdSnapshot(snapshot("b", 2));
  await holdSnapshot(snapshot("a", 1));
  expect(registry.register).toHaveBeenCalledOnce();
  expect(registry.remove).not.toHaveBeenCalled();
  await holdSnapshot(snapshot("c", 3));
  expect(registry.remove).toHaveBeenCalledExactlyOnceWith("b");
});
