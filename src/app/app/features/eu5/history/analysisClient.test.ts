import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  api: { memory: vi.fn(), connectFrames: vi.fn(), disconnectFrames: vi.fn() },
  cancel: vi.fn(),
  setState: vi.fn(),
  workers: [] as Worker[],
  state: { snapshots: [] as { campaignId: string }[], analysisPausedCampaigns: [] as string[] },
}));
vi.mock("comlink", () => ({ wrap: () => mocks.api, transfer: (value: unknown) => value }));
vi.mock("@/lib/sentryWorker", () => ({ trackWorker: () => () => {} }));
vi.mock("./store", () => ({
  useHistory: {
    getState: () => ({ ...mocks.state, cancel: mocks.cancel }),
    setState: mocks.setState,
  },
}));
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.workers = [];
  mocks.state = { snapshots: [], analysisPausedCampaigns: [] };
  vi.stubGlobal(
    "Worker",
    class extends EventTarget {
      terminate = vi.fn();
      constructor() {
        super();
        mocks.workers.push(this as unknown as Worker);
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
it("stops the import and releases lost metadata when the worker fails", async () => {
  const { campaignAnalysis } = await import("./analysisClient");
  campaignAnalysis();
  mocks.workers[0].dispatchEvent(new Event("error"));
  expect(mocks.cancel).toHaveBeenCalledOnce();
  expect(mocks.setState).toHaveBeenCalledWith(
    expect.objectContaining({
      snapshots: [],
      sources: {},
      analysisPaused: true,
      analysisPausedCampaigns: [],
      issues: [expect.stringContaining("Reimport")],
    }),
  );
});
it("keeps every lost campaign retryable after another campaign resumes", async () => {
  const { campaignAnalysis } = await import("./analysisClient");
  mocks.state = {
    snapshots: [{ campaignId: "a" }, { campaignId: "b" }, { campaignId: "a" }],
    analysisPausedCampaigns: ["paused"],
  };
  campaignAnalysis();
  mocks.workers[0].dispatchEvent(new Event("error"));
  expect(mocks.setState).toHaveBeenCalledWith(
    expect.objectContaining({ analysisPausedCampaigns: ["paused", "a", "b"] }),
  );
});
