import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AnalysisQuery, QUERY_REFRESH_MS } from "./query";
import type { QueryReply } from "./session";

type Call = { args: string; resolve: (reply: QueryReply<string>) => void };
let calls: Call[];
let generation: number;
let now: number;
const query = () =>
  new AnalysisQuery<string>(
    () => generation,
    () => now,
  );
/** A query whose reply value names its arguments and dataset. */
const input = (identity: string, dataset: string) => ({
  identity,
  dataset,
  run: () =>
    new Promise<QueryReply<string>>((resolve) =>
      calls.push({ args: `${identity}@${dataset}`, resolve }),
    ),
});
const reply = (call: Call, at = generation) =>
  call.resolve({ generation: at, snapshotIds: [], value: call.args });
const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

beforeEach(() => {
  vi.useFakeTimers();
  calls = [];
  generation = 1;
  now = 0;
});
afterEach(() => vi.useRealTimers());

it("runs a new query now and keeps its result while the dataset grows", async () => {
  const q = query();
  q.update(input("world", "a"));
  expect(calls).toHaveLength(1);
  reply(calls[0]);
  await flush();
  expect(q.snapshot().result).toBe("world@a");
  // A rerender with the same query, such as a playhead move, does not run it again.
  q.update(input("world", "a"));
  expect(calls).toHaveLength(1);
  now = 200;
  q.update(input("world", "a,b"));
  expect(q.snapshot().result).toBe("world@a");
  expect(calls).toHaveLength(1);
  now = QUERY_REFRESH_MS;
  vi.advanceTimersByTime(QUERY_REFRESH_MS - 200);
  expect(calls.map((c) => c.args)).toEqual(["world@a", "world@a,b"]);
});

it("waits for a pending request, then runs one time with the latest dataset", async () => {
  const q = query();
  q.update(input("world", "a"));
  q.update(input("world", "a,b"));
  q.update(input("world", "a,b,c"));
  expect(calls).toHaveLength(1);
  now = 5000;
  reply(calls[0]);
  await flush();
  expect(calls.map((c) => c.args)).toEqual(["world@a", "world@a,b,c"]);
});

it("ignores a reply for another query or for an earlier request", async () => {
  const q = query();
  q.update(input("world", "a"));
  q.update(input("country", "a"));
  q.update(input("world", "a"));
  expect(calls).toHaveLength(3);
  reply(calls[2]);
  reply(calls[1]);
  await flush();
  reply(calls[0]);
  await flush();
  expect(q.snapshot()).toEqual({ identity: "world", result: "world@a", error: null });
  expect(q.snapshot().result).toBe(calls[2].args);
});

it("runs again after a clear, also when the new import has the same number of snapshots", async () => {
  const q = query();
  q.update(input("world", "a,b"));
  // The session is cleared while the query runs. Its reply is from the old data.
  generation = 2;
  reply(calls[0], 1);
  await flush();
  expect(q.snapshot().result).toBeNull();
  expect(calls).toHaveLength(2);
  reply(calls[1]);
  await flush();
  expect(q.snapshot().result).toBe("world@a,b");
  now = 5000;
  q.update(input("world", "c,d"));
  expect(calls.at(-1)!.args).toBe("world@c,d");
});

it("shows an error for the current query and ignores replies after dispose", async () => {
  const q = query();
  q.update({ identity: "world", dataset: "a", run: () => Promise.reject(Error("lost")) });
  await flush();
  await flush();
  expect(q.snapshot().error).toBe("Error: lost");
  const listener = vi.fn();
  q.subscribe(listener);
  now = 5000;
  q.update(input("world", "b"));
  q.dispose();
  reply(calls[0]);
  await flush();
  expect(listener).not.toHaveBeenCalled();
});
