import { expect, it, vi } from "vitest";
import { LatestRequest } from "./latestRequest";
it("keeps one active operation and replaces pending requests", async () => {
  const first = Promise.withResolvers<void>();
  const run = vi.fn(async (value: number, current: () => boolean) => {
    if (value === 1) await first.promise;
    if (!current()) throw new DOMException("Replaced", "AbortError");
    return value;
  });
  const queue = new LatestRequest(run);
  const a = queue.request(1);
  const failedA = expect(a).rejects.toMatchObject({ name: "AbortError" });
  const b = queue.request(2);
  const failedB = expect(b).rejects.toMatchObject({ name: "AbortError" });
  const c = queue.request(3);
  first.resolve();
  await Promise.all([failedA, failedB]);
  await expect(c).resolves.toBe(3);
  expect(run.mock.calls.map(([v]) => v)).toEqual([1, 3]);
});
it("accepts new work submitted as an earlier request completes", async () => {
  const queue = new LatestRequest(async (value: number) => value);
  await expect(queue.request(1).then(() => queue.request(2))).resolves.toBe(2);
});
it("stops pending work and waits for the active operation before inspection", async () => {
  const gate = Promise.withResolvers<void>();
  const run = vi.fn(async () => {
    await gate.promise;
    return 1;
  });
  const queue = new LatestRequest(run);
  const a = queue.request(1),
    b = queue.request(2);
  const failures = [
    expect(a).rejects.toMatchObject({ name: "AbortError" }),
    expect(b).rejects.toMatchObject({ name: "AbortError" }),
  ];
  let stopped = false;
  const stop = queue.stop().then(() => {
    stopped = true;
  });
  await Promise.resolve();
  expect(stopped).toBe(false);
  gate.resolve();
  await Promise.all([...failures, stop]);
  expect(run).toHaveBeenCalledOnce();
  await expect(queue.request(3)).resolves.toBe(1);
});
