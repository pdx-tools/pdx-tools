import { expect, it, vi } from "vitest";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
vi.mock("../store", () => ({ useEu5PlaythroughId: vi.fn() }));
vi.mock("@/features/account", () => ({ useIsDeveloper: () => false }));
vi.mock("./analyzeCampaign", () => ({ analyzeCampaign: vi.fn() }));
import { campaignAnalysisSourceKey } from "@/features/campaign/analysis/autoAnalysis";
import { pendingCampaignAnalysis } from "./CampaignAnalysis";
const entry = (id: string): LocalSaveEntry => ({
  id,
  game: "eu5",
  name: `${id}.eu5`,
  identity: null,
  version: null,
  problem: null,
  batch: 0,
  ref: { kind: "file", file: new File(["save"], `${id}.eu5`, { lastModified: 1 }) },
});
it("does not mix games or known campaigns", () => {
  const a = entry("one");
  expect(
    pendingCampaignAnalysis(
      [
        a,
        { ...a, game: "eu4" },
        {
          ...a,
          identity: {
            playthroughId: "other" as never,
            campaignIdHint: null,
            date: { year: 1360, month: 1, day: 1 },
          },
        },
      ],
      "campaign",
    ),
  ).toEqual([a]);
});
it("re-analyzes modified saves but not a metadata read of the same file version", () => {
  const a = entry("one");
  const same = { ...a, version: { size: 4, lastModified: 1 } };
  const changed = { ...a, version: { size: 5, lastModified: 2 } };
  // An attempt is keyed by the file version read, as the held file gives it before a read.
  expect(campaignAnalysisSourceKey(same)).toBe(campaignAnalysisSourceKey(a));
  expect(campaignAnalysisSourceKey(changed)).not.toBe(campaignAnalysisSourceKey(a));
});

it("enables analysis per campaign and resumes only the requested campaign", async () => {
  const { useHistory } = await import("./store");
  useHistory.setState({
    analysisEnabledCampaigns: [],
    pausedCampaigns: { one: "stopped", two: "stopped" },
  });
  expect(useHistory.getState().analysisEnabledCampaigns).toEqual([]);
  useHistory.getState().enableAnalysis("one");
  useHistory.getState().enableAnalysis("one");
  expect(useHistory.getState().analysisEnabledCampaigns).toEqual(["one"]);
  expect(Object.keys(useHistory.getState().pausedCampaigns)).toEqual(["two"]);
  useHistory.setState({ analysisEnabledCampaigns: [], pausedCampaigns: {} });
});

it("keeps completed file versions analyzed across UI remounts", async () => {
  const { useHistory } = await import("./store");
  const a = entry("finished");
  useHistory.setState({
    sources: { finished: { snapshotId: "done", version: { size: 4, lastModified: 1 } } },
    snapshots: [{ id: "done", campaignId: "campaign" } as never],
  });
  expect(pendingCampaignAnalysis([a], "campaign")).toEqual([]);
  expect(
    pendingCampaignAnalysis([{ ...a, version: { size: 5, lastModified: 2 } }], "campaign"),
  ).toHaveLength(1);
  useHistory.setState({ sources: {}, snapshots: [] });
});
