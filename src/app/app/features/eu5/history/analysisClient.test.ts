import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  api: { memoryBytes: vi.fn(), connectFrames: vi.fn(), disconnectFrames: vi.fn() },
  cancel: vi.fn(),
  setState: vi.fn(),
  untrack: vi.fn(),
  workers: [] as Worker[],
  state: { snapshots: [] as { campaignId: string }[], analysisPausedCampaigns: [] as string[] },
}));
vi.mock("comlink", () => ({ wrap: () => mocks.api, transfer: (value: unknown) => value }));
vi.mock("@/lib/sentryWorker", () => ({ trackWorker: () => mocks.untrack }));
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
it("rejects pending calls on worker failure, releases lost metadata, and permits reimport", async () => {
  const { campaignAnalysis } = await import("./analysisClient");
  mocks.api.memoryBytes.mockReturnValueOnce(new Promise(() => {})).mockResolvedValue(42);
  const old = campaignAnalysis();
  const pending = old.memoryBytes();
  const failure = expect(pending).rejects.toThrow("Reimport");
  await vi.waitFor(() => expect(mocks.api.memoryBytes).toHaveBeenCalledOnce());
  mocks.workers[0].dispatchEvent(new Event("error"));
  await failure;
  expect(mocks.cancel).toHaveBeenCalledOnce();
  expect(mocks.untrack).toHaveBeenCalledOnce();
  expect(mocks.setState).toHaveBeenCalledWith(
    expect.objectContaining({
      snapshots: [],
      sources: {},
      analysisPaused: true,
      analysisPausedCampaigns: [],
    }),
  );
  const next = campaignAnalysis();
  expect(next).not.toBe(old);
  expect(mocks.workers).toHaveLength(2);
  expect(await next.memoryBytes()).toBe(42);
  await expect(old.memoryBytes()).rejects.toThrow("Reimport");
});
it("also rejects calls when worker messages cannot be decoded", async () => {
  const { campaignAnalysis } = await import("./analysisClient");
  mocks.api.memoryBytes.mockReturnValue(new Promise(() => {}));
  const pending = campaignAnalysis().memoryBytes();
  const failure = expect(pending).rejects.toThrow("Campaign analysis stopped");
  mocks.workers[0].dispatchEvent(new Event("messageerror"));
  await failure;
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

it("disconnects game ports immediately when the storage worker fails", async () => {
  const { connectAnalysisFrames } = await import("./analysisClient");
  const connect = vi.fn().mockResolvedValue(undefined);
  const disconnect = await connectAnalysisFrames(connect);
  const id = connect.mock.calls[0][0];
  mocks.workers[0].dispatchEvent(new Event("error"));
  expect(connect).toHaveBeenLastCalledWith(id, null);
  disconnect();
});
