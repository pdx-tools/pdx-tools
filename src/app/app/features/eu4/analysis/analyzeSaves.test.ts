import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  session: new AbortController(),
  state: { progress: {}, pausedCampaigns: {} as Record<string, string> },
  uploads: [{ saveId: "u", name: "u.eu4" }],
}));
vi.mock("./analyzeCampaign", () => ({ analyzeEu4Campaign: mocks.analyze }));
vi.mock("./analysisClient", () => ({ eu4Analysis: { signal: () => mocks.session.signal } }));
vi.mock("./campaignSaves", () => ({
  replacedSnapshots: () => [],
  pendingUploads: () => mocks.uploads,
}));
vi.mock("./store", () => ({ useEu4History: { getState: () => mocks.state } }));
import { IMPORT_BUSY_ERROR, analysisAdmission } from "@/features/campaign/analysis/admission";
import { readEu4Uploads } from "./analyzeSaves";

const busy = Object.assign(Error("busy"), { name: IMPORT_BUSY_ERROR });

/**
 * Press Read uploads while the local saves are read, run `during` in the
 * wait, then end that read. Returns how many times analysis ran.
 */
async function readAfterBusy(during: () => void) {
  mocks.analyze.mockReset();
  mocks.session = new AbortController();
  mocks.state.pausedCampaigns = {};
  mocks.uploads = [{ saveId: "u", name: "u.eu4" }];
  mocks.analyze.mockRejectedValueOnce(busy).mockResolvedValue(undefined);
  const lease = analysisAdmission().acquireImport();
  const reading = readEu4Uploads([], "campaign");
  await vi.waitFor(() => expect(mocks.analyze).toHaveBeenCalledTimes(1));
  during();
  lease.release();
  await reading;
  return mocks.analyze.mock.calls.length;
}

it("reads the uploads after another import ends, also one that shows progress", async () => {
  expect(await readAfterBusy(() => {})).toBe(2);
  expect(mocks.analyze).toHaveBeenLastCalledWith(
    [],
    "campaign",
    [{ saveId: "u", name: "u.eu4" }],
    [],
  );
});

it("does not read after a pause, a campaign change or a read of the same uploads", async () => {
  expect(await readAfterBusy(() => (mocks.state.pausedCampaigns = { campaign: "stopped" }))).toBe(
    1,
  );
  expect(await readAfterBusy(() => mocks.session.abort())).toBe(1);
  expect(await readAfterBusy(() => (mocks.uploads = []))).toBe(1);
});
