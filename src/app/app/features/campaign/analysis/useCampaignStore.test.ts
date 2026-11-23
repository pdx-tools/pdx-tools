import { expect, it, vi } from "vitest";
import type * as React from "react";

// Run the hook as a function: the effect runs at once.
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useEffect: (effect: () => void) => void effect(),
}));
import { create } from "zustand";
import { campaignAnalysisState } from "./analysisState";
import type { CampaignAnalysisState } from "./analysisState";
import type { SnapshotDescriptor } from "./descriptor";
import { forgetCampaign, useCampaignStore } from "./useCampaignStore";
import type { StoringAnalysisWorkerClient } from "./workerClient";
import type { AnalysisStore } from "./session";

// The campaign's folder is there, but its index can't be read.
const folder = { getDirectoryHandle: async () => folder };
vi.stubGlobal("navigator", {
  storage: {
    getDirectory: async () => folder,
    persisted: async () => false,
    persist: () => new Promise(() => {}),
  },
});

it("writes this visit's points after a Forget of an unreadable index", async () => {
  vi.useFakeTimers();
  const history = create<CampaignAnalysisState>()((set) => campaignAnalysisState(set));
  history.getState().add([{ id: "a", campaignId: "c", dateSort: 15100101 } as SnapshotDescriptor]);
  const persist = vi.fn(async () => ({ status: "written", kept: 1, ids: ["a"], missing: 0 }));
  const analysis = {
    generation: () => 1,
    claim: () => {},
    restore: async () => ({ generation: 1, reply: { status: "unreadable" } }),
    persist,
    forget: async () => {},
    remove: async () => {},
  } as unknown as StoringAnalysisWorkerClient<AnalysisStore>;
  useCampaignStore({ history, analysis, playthroughId: "c" });
  await vi.waitFor(() => expect(history.getState().stored?.state).toBe("unreadable"));
  expect(persist).not.toHaveBeenCalled();

  await forgetCampaign(history, analysis, "c");
  await vi.advanceTimersByTimeAsync(1000);
  expect(persist).toHaveBeenCalledOnce();
  expect(history.getState().stored).toMatchObject({ state: "ready", kept: 1 });
  expect(history.getState().points.a.kept).toBe(true);
  vi.useRealTimers();
});
