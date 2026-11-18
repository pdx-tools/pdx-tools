import { expect, it } from "vitest";
import { sessionApi } from "./session";
import type { AnalysisStore } from "./session";

// Rust tests the generation, the store and the queries. This tests only
// that the worker methods wait for the module and pass each call through.
it("waits for the store and passes each call to it without a change", async () => {
  const calls: unknown[][] = [];
  const store = {
    open: (...args: unknown[]) => void calls.push(["open", ...args]),
    memory: () => ({ snapshots: 3 }),
  } as unknown as AnalysisStore;
  const { promise, resolve } = Promise.withResolvers<AnalysisStore>();
  const api = sessionApi(promise);
  const opened = api.open(4);
  expect(calls).toEqual([]);
  resolve(store);
  await opened;
  expect(calls).toEqual([["open", 4]]);
  expect(await api.memory()).toEqual({ snapshots: 3 });
});
