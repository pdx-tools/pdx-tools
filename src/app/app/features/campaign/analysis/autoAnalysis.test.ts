import { expect, it, vi } from "vitest";
import type * as React from "react";
import type * as Zustand from "zustand";

// Run the hook as a function: refs and state persist, and effects run when their deps change.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], at: 0 }));
vi.mock("react", async (original) => {
  const slot = <T>(init: () => T): [number, T] => {
    const at = hooks.at++;
    if (!(at in hooks.slots)) hooks.slots[at] = init();
    return [at, hooks.slots[at] as T];
  };
  return {
    ...(await original<typeof React>()),
    useRef: (value: unknown) => slot(() => ({ current: value }))[1],
    useState: (value: unknown) => {
      const [at, state] = slot(() => value);
      return [state, (next: (x: unknown) => unknown) => (hooks.slots[at] = next(hooks.slots[at]))];
    },
    useEffect: (effect: () => void, deps: unknown[]) => {
      const [at, previous] = slot<unknown[] | null>(() => null);
      if (previous && deps.every((x, i) => Object.is(x, previous[i]))) return;
      hooks.slots[at] = deps;
      effect();
    },
  };
});
vi.mock("zustand", async (original) => ({
  ...(await original<typeof Zustand>()),
  useStore: (store: { getState: () => unknown }, select: (state: unknown) => unknown) =>
    select(store.getState()),
}));
import { create } from "zustand";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
import { analysisAdmission } from "./admission";
import { campaignAnalysisState } from "./analysisState";
import type { CampaignAnalysisState } from "./analysisState";
import { useCampaignAutoAnalysis } from "./autoAnalysis";

it("tries saves again when another import held the lease", async () => {
  const history = create<CampaignAnalysisState>()((set) => campaignAnalysisState(set));
  history.getState().enableAnalysis("campaign");
  const entry = {
    id: "local-1",
    version: { size: 1, lastModified: 1 },
    ref: { kind: "handle" },
  } as unknown as LocalSaveEntry;
  const busy = Object.assign(Error("An analysis is already running."), {
    name: "AnalysisImportBusy",
  });
  const analyze = vi.fn().mockRejectedValueOnce(busy).mockResolvedValue(undefined);
  const pending = () => [entry];
  const run = () => {
    hooks.at = 0;
    useCampaignAutoAnalysis({
      history,
      claim: () => {},
      playthroughId: "campaign",
      featureEnabled: true,
      pending,
      analyze,
    });
  };

  // A watched write holds the lease, so the first analysis is busy.
  const lease = analysisAdmission().acquireImport();
  run();
  await vi.waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));
  lease.release();
  await new Promise((resolve) => setTimeout(resolve));
  run();
  expect(analyze).toHaveBeenCalledTimes(2);
  expect(history.getState().issues).toEqual([]);
});

it("reads a stopped save again once the campaign resumes", async () => {
  hooks.slots = [];
  const history = create<CampaignAnalysisState>()((set) => campaignAnalysisState(set));
  history.getState().enableAnalysis("campaign");
  const entry = {
    id: "local-2",
    version: { size: 1, lastModified: 1 },
    ref: { kind: "handle" },
  } as unknown as LocalSaveEntry;
  const analyze = vi.fn(async () => {});
  const claim = () => {};
  const pending = () => [entry];
  const run = () => {
    hooks.at = 0;
    useCampaignAutoAnalysis({
      history,
      claim,
      playthroughId: "campaign",
      featureEnabled: true,
      pending,
      analyze,
    });
  };
  run();
  await vi.waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));
  // The player stops the read before the save is read, then resumes.
  history.getState().pauseAnalysis("campaign");
  run();
  history.getState().enableAnalysis("campaign");
  run();
  expect(analyze).toHaveBeenCalledTimes(2);
  await vi.waitFor(() => expect(history.getState().progress).toBeNull());

  // A save that failed in its version waits after a resume.
  history.setState({
    failedSources: { [entry.id]: { version: entry.version, error: "bad save" } },
  });
  history.getState().pauseAnalysis("campaign");
  run();
  history.getState().enableAnalysis("campaign");
  run();
  expect(analyze).toHaveBeenCalledTimes(2);
});

it("lets failed saves take no place in an import", () => {
  hooks.slots = [];
  const history = create<CampaignAnalysisState>()((set) => campaignAnalysisState(set));
  history.getState().enableAnalysis("campaign");
  const entries = Array.from(
    { length: 1002 },
    (_, i) =>
      ({
        id: `local-${i}`,
        version: { size: 1, lastModified: 1 },
        ref: { kind: "handle" },
      }) as unknown as LocalSaveEntry,
  );
  history.setState({
    failedSources: { "local-0": { version: { size: 1, lastModified: 1 }, error: "bad save" } },
  });
  const analyze = vi.fn(async () => {});
  hooks.at = 0;
  useCampaignAutoAnalysis({
    history,
    claim: () => {},
    playthroughId: "campaign",
    featureEnabled: true,
    pending: () => entries,
    analyze,
  });
  const batch = (analyze.mock.calls as unknown as [LocalSaveEntry[]][])[0][0];
  expect(batch).toHaveLength(1000);
  expect(batch[0].id).toBe("local-1");
  expect(batch.at(-1)!.id).toBe("local-1000");
});
