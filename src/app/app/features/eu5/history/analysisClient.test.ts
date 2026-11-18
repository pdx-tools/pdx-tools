import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  api: { open: vi.fn(), memory: vi.fn(), connectFrames: vi.fn(), disconnectFrames: vi.fn() },
  cancel: vi.fn(),
  removeSnapshots: vi.fn(),
  pauseAnalysis: vi.fn(),
  setState: vi.fn(),
  workers: [] as Worker[],
  state: { snapshots: [] as { campaignId: string }[], analysisPausedCampaigns: [] as string[] },
}));
vi.mock("comlink", () => ({ wrap: () => mocks.api, transfer: (value: unknown) => value }));
vi.mock("@/lib/sentryWorker", () => ({ trackWorker: () => () => {} }));
vi.mock("./store", () => ({
  useHistory: {
    getState: () => ({
      ...mocks.state,
      cancel: mocks.cancel,
      removeSnapshots: mocks.removeSnapshots,
      pauseAnalysis: mocks.pauseAnalysis,
    }),
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
  const { eu5Analysis } = await import("./analysisClient");
  eu5Analysis.remote();
  mocks.workers[0].dispatchEvent(new Event("error"));
  expect(mocks.cancel).toHaveBeenCalledOnce();
  expect(mocks.removeSnapshots).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.pauseAnalysis).not.toHaveBeenCalled();
  expect(mocks.setState).toHaveBeenCalledWith({ issues: [expect.stringContaining("Reimport")] });
});
it("pauses the claimed campaign when the worker fails", async () => {
  const { eu5Analysis } = await import("./analysisClient");
  eu5Analysis.claim("a");
  eu5Analysis.remote();
  mocks.workers[0].dispatchEvent(new Event("error"));
  expect(mocks.pauseAnalysis).toHaveBeenCalledExactlyOnceWith("a");
});
