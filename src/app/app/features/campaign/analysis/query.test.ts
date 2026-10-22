import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalysisQuery, QUERY_REFRESH_MS } from "./query";
import type { QueryInput } from "./query";
import type { QueryOutcome, QueryReply } from "./session";

type Call = {
  identity: string;
  sequence: number;
  dataset: string;
  resolve: (outcome?: QueryOutcome<string>, generation?: number) => void;
  reject: (error: Error) => void;
};

let generation = 1;
let calls: Call[] = [];
let query: AnalysisQuery<string>;

function input(identity: string, dataset: string): QueryInput<string> {
  return {
    identity,
    dataset,
    run: (requested, sequence) =>
      new Promise<QueryReply<string>>((resolve, reject) => {
        const atRequest = generation;
        calls.push({
          identity: requested,
          sequence,
          dataset,
          resolve: (outcome = { status: "ok", value: dataset }, replyGeneration = atRequest) =>
            resolve({
              generation: replyGeneration,
              identity: requested,
              sequence,
              snapshotIds: dataset.split(","),
              outcome,
            }),
          reject,
        });
      }),
  };
}

const shown = (identity: string) => query.current(identity);

beforeEach(() => {
  vi.useFakeTimers();
  generation = 1;
  calls = [];
  query = new AnalysisQuery(
    () => generation,
    () => Date.now(),
  );
});
afterEach(() => {
  query.dispose();
  vi.useRealTimers();
});

describe("a growing dataset", () => {
  it("runs the query again at most one time each period and keeps the previous result", async () => {
    const listener = vi.fn();
    query.subscribe(listener);
    query.update(input("world", "a"));
    calls[0].resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(shown("world")).toMatchObject({ result: "a", snapshotIds: ["a"], error: null });
    expect(listener).toHaveBeenCalledOnce();
    query.update(input("world", "a,b"));
    query.update(input("world", "a,b,c"));
    expect(calls).toHaveLength(1);
    expect(shown("world").result).toBe("a");
    await vi.advanceTimersByTimeAsync(QUERY_REFRESH_MS);
    expect(calls).toHaveLength(2);
    expect(calls[1].dataset).toBe("a,b,c");
    calls[1].resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(shown("world").result).toBe("a,b,c");
  });

  it("waits for a pending request, then runs one time on the latest dataset", async () => {
    query.update(input("world", "a"));
    query.update(input("world", "a,b"));
    query.update(input("world", "a,b,c"));
    await vi.advanceTimersByTimeAsync(QUERY_REFRESH_MS * 3);
    expect(calls).toHaveLength(1);
    calls[0].resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
    expect(calls[1].dataset).toBe("a,b,c");
    calls[1].resolve();
    await vi.advanceTimersByTimeAsync(QUERY_REFRESH_MS * 3);
    expect(calls).toHaveLength(2);
  });

  it("runs again when other snapshots replace the same number of snapshots", async () => {
    query.update(input("world", "a,b"));
    calls[0].resolve();
    await vi.advanceTimersByTimeAsync(0);
    query.update(input("world", "c,d"));
    await vi.advanceTimersByTimeAsync(QUERY_REFRESH_MS);
    expect(calls.map((call) => call.dataset)).toEqual(["a,b", "c,d"]);
  });
});

it("does not run again for an update with the same query and dataset, such as a playhead move", async () => {
  query.update(input("world", "a"));
  calls[0].resolve();
  await vi.advanceTimersByTimeAsync(0);
  for (let i = 0; i < 5; i++) query.update(input("world", "a"));
  await vi.advanceTimersByTimeAsync(QUERY_REFRESH_MS * 2);
  expect(calls).toHaveLength(1);
  expect(shown("world").result).toBe("a");
});

describe("replies", () => {
  it("for another query are ignored", async () => {
    query.update(input("world", "a"));
    query.update(input("country", "a"));
    expect(calls.map((call) => call.identity)).toEqual(["world", "country"]);
    calls[1].resolve();
    calls[0].resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(shown("country").result).toBe("a");
    expect(shown("world").result).toBeNull();
  });

  it("from an older request do not replace a newer result", async () => {
    query.update(input("world", "a"));
    query.update(input("country", "a"));
    query.update(input("world", "a,b"));
    calls[2].resolve();
    await vi.advanceTimersByTimeAsync(0);
    calls[0].resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(shown("world").result).toBe("a,b");
  });

  it("from another session generation are ignored, and a clear runs the query now", async () => {
    query.update(input("world", "a"));
    calls[0].resolve();
    await vi.advanceTimersByTimeAsync(0);
    query.update(input("world", "a,b"));
    await vi.advanceTimersByTimeAsync(QUERY_REFRESH_MS);
    generation = 2;
    expect(shown("world").result).toBeNull();
    query.update(input("world", "c"));
    expect(calls).toHaveLength(3);
    calls[1].resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(shown("world").result).toBeNull();
    calls[2].resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(shown("world")).toMatchObject({ result: "c", snapshotIds: ["c"] });
  });

  it("that the worker marks stale do not show", async () => {
    query.update(input("world", "a"));
    calls[0].resolve({ status: "stale" });
    await vi.advanceTimersByTimeAsync(0);
    expect(shown("world")).toMatchObject({ result: null, error: null });
  });

  it("that fail show the error for the current query", async () => {
    query.update(input("world", "a"));
    calls[0].reject(Error("Campaign analysis stopped"));
    await vi.advanceTimersByTimeAsync(0);
    expect(shown("world").error).toContain("stopped");
  });
});

it("stops a scheduled refresh after dispose", async () => {
  const listener = vi.fn();
  query.subscribe(listener);
  query.update(input("world", "a"));
  calls[0].resolve();
  await vi.advanceTimersByTimeAsync(0);
  query.update(input("world", "a,b"));
  query.dispose();
  await vi.advanceTimersByTimeAsync(QUERY_REFRESH_MS * 2);
  expect(calls).toHaveLength(1);
  expect(listener).toHaveBeenCalledOnce();
});

it("ignores a pending reply after dispose", async () => {
  const listener = vi.fn();
  query.subscribe(listener);
  query.update(input("world", "a"));
  query.update(input("world", "a,b"));
  query.dispose();
  calls[0].resolve();
  await vi.advanceTimersByTimeAsync(QUERY_REFRESH_MS * 2);
  expect(shown("world").result).toBeNull();
  expect(listener).not.toHaveBeenCalled();
  expect(calls).toHaveLength(1);
});
