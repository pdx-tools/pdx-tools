import { expect, it, vi } from "vitest";
import type { LocalSaveEntry } from "@/features/campaign/localSaves";
vi.mock("../store", () => ({ useEu5PlaythroughId: vi.fn() }));
vi.mock("@/features/account", () => ({ useIsDeveloper: () => false }));
vi.mock("./analyzeCampaign", () => ({ analyzeCampaign: vi.fn() }));
import { pendingCampaignAnalysis, campaignAnalysisSourceKey } from "./CampaignAnalysis";
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
it("finds new selected files without repeating attempted imports", () => {
  const a = entry("one"),
    b = entry("two");
  const attempted = new Set([`campaign:${campaignAnalysisSourceKey(a)}`]);
  expect(pendingCampaignAnalysis([a, b], "campaign", attempted)).toEqual([b]);
  expect(pendingCampaignAnalysis([a, b, entry("three")], "campaign", attempted)).toHaveLength(2);
});
it("does not mix games or known campaigns and permits a previously unknown save in its own campaign", () => {
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
      new Set(),
    ),
  ).toEqual([a]);
  const attempted = new Set([`other:${campaignAnalysisSourceKey(a)}`]);
  expect(pendingCampaignAnalysis([a], "campaign", attempted)).toEqual([a]);
});
it("re-analyzes modified saves but not a metadata read of the same file version", () => {
  const a = entry("one");
  const attempted = new Set([`campaign:${campaignAnalysisSourceKey(a)}`]);
  const same = { ...a, version: { size: 4, lastModified: 1 } };
  const changed = { ...a, version: { size: 5, lastModified: 2 } };
  expect(pendingCampaignAnalysis([same], "campaign", attempted)).toEqual([]);
  expect(pendingCampaignAnalysis([changed], "campaign", attempted)).toEqual([changed]);
});

it("enables analysis per campaign and resumes only the requested campaign", async () => {
  const { useHistory } = await import("./store");
  useHistory.setState({ analysisEnabledCampaigns: [], analysisPausedCampaigns: ["one", "two"] });
  expect(useHistory.getState().analysisEnabledCampaigns).toEqual([]);
  useHistory.getState().enableAnalysis("one");
  useHistory.getState().enableAnalysis("one");
  expect(useHistory.getState().analysisEnabledCampaigns).toEqual(["one"]);
  expect(useHistory.getState().analysisPausedCampaigns).toEqual(["two"]);
  useHistory.setState({ analysisEnabledCampaigns: [], analysisPausedCampaigns: [] });
});

it("keeps completed file versions analyzed across UI remounts", async () => {
  const { useHistory } = await import("./store");
  const a = entry("finished");
  useHistory.setState({
    sources: { finished: { hash: "done", version: { size: 4, lastModified: 1 } } },
    snapshots: [{ hash: "done", campaignId: "campaign" } as never],
  });
  expect(pendingCampaignAnalysis([a], "campaign", new Set())).toEqual([]);
  expect(
    pendingCampaignAnalysis(
      [{ ...a, version: { size: 5, lastModified: 2 } }],
      "campaign",
      new Set(),
    ),
  ).toHaveLength(1);
  useHistory.setState({ sources: {}, snapshots: [] });
});
