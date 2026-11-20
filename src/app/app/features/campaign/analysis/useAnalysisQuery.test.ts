import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type * as React from "react";
import type * as Zustand from "zustand";

// Run the hook as a function: state persists between calls and effects run at once.
const hooks = vi.hoisted(() => ({ state: [] as unknown[], at: 0 }));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useState: (init: () => unknown) => {
    const at = hooks.at++;
    if (!(at in hooks.state)) hooks.state[at] = init();
    return [hooks.state[at]];
  },
  useMemo: (make: () => unknown) => make(),
  useEffect: (effect: () => void) => effect(),
  useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get(),
}));
vi.mock("zustand", async (original) => ({
  ...(await original<typeof Zustand>()),
  useStore: (store: { getState: () => unknown }, select: (state: unknown) => unknown) =>
    select(store.getState()),
}));
import { create } from "zustand";
import { campaignAnalysisState } from "./analysisState";
import type { CampaignAnalysisState } from "./analysisState";
import type { SnapshotDescriptor } from "./descriptor";
import { useAnalysisQuery } from "./useAnalysisQuery";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("runs again when snapshots arrive and gives nothing after a new generation", async () => {
  hooks.state = [];
  const history = create<CampaignAnalysisState>()((set) => campaignAnalysisState(set));
  let generation = 1;
  const query = vi.fn(async ({ identity, sequence }: { identity: string; sequence: number }) => {
    const ids = history.getState().snapshots.map((x) => x.id);
    return {
      generation,
      identity,
      sequence,
      snapshotIds: ids,
      outcome: { status: "ok" as const, value: ids.length },
    };
  });
  const client = { generation: () => generation, query } as unknown as Parameters<
    typeof useAnalysisQuery
  >[0];
  const run = () => {
    hooks.at = 0;
    return useAnalysisQuery(client, history, "campaign", { kind: "worldDevelopment" });
  };
  const snapshot = (id: string) =>
    ({ id, campaignId: "campaign", dateSort: 1 }) as SnapshotDescriptor;

  // No snapshots: nothing runs.
  expect(run()).toMatchObject({ result: null, loading: false });
  expect(query).not.toHaveBeenCalled();

  history.getState().add([snapshot("a")]);
  run();
  await vi.runAllTimersAsync();
  expect(run().result).toBe(1);

  // A new snapshot runs the query again, at most once a second.
  history.getState().add([snapshot("b")]);
  run();
  await vi.runAllTimersAsync();
  expect(query).toHaveBeenCalledTimes(2);
  expect(run().result).toBe(2);

  // A clear starts a new generation; the old result is not shown.
  generation = 2;
  expect(run().result).toBeNull();
});

it("keeps a result through an added snapshot but not past a removed one", async () => {
  hooks.state = [];
  const history = create<CampaignAnalysisState>()((set) => campaignAnalysisState(set));
  const query = vi.fn(async ({ identity, sequence }: { identity: string; sequence: number }) => ({
    generation: 1,
    identity,
    sequence,
    snapshotIds: history.getState().snapshots.map((x) => x.id),
    outcome: { status: "ok" as const, value: "answer" },
  }));
  const client = { generation: () => 1, query } as unknown as Parameters<
    typeof useAnalysisQuery
  >[0];
  const run = (ids: string[]) => {
    hooks.at = 0;
    return useAnalysisQuery(
      client,
      history,
      "campaign",
      { kind: "worldDevelopment" },
      {
        kind: "ids",
        ids,
      },
    );
  };
  const snapshot = (id: string) =>
    ({ id, campaignId: "campaign", dateSort: 1 }) as SnapshotDescriptor;
  history.getState().add([snapshot("a"), snapshot("b")]);
  run(["a", "b"]);
  await vi.runAllTimersAsync();
  expect(run(["a", "b"]).result).toBe("answer");
  // A new save keeps the last result until the new one.
  history.getState().add([snapshot("c")]);
  expect(run(["a", "b", "c"]).result).toBe("answer");
  // A save that leaves the selection, such as one that another replaced, ends it.
  expect(run(["a", "c"]).result).toBeNull();
});
