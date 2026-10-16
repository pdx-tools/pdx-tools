import { renderToString } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { Snapshot } from "./types";

const mocks = vi.hoisted(() => ({
  snapshots: [] as Snapshot[],
  playthroughId: "campaign" as string | null,
}));
vi.mock("./MapHistory", () => ({
  useMapHistory: () => ({ clearCampaign: vi.fn(), inspecting: false }),
}));
vi.mock("./store", () => ({
  isAnalysisPaused: () => false,
  useHistory: () => ({ snapshots: mocks.snapshots, progress: null, issues: [] }),
}));
vi.mock("./analyzeCampaign", () => ({ analyzeCampaign: vi.fn() }));
vi.mock("@/features/campaign/CampaignProvider", () => ({ useCampaign: () => ({ saves: [] }) }));
vi.mock("@/features/campaign/localSaves", () => ({
  localSaveRegistry: { useEntries: () => [] },
  holdsRef: vi.fn(),
  registerLocalSaves: vi.fn(),
}));
vi.mock("../store", () => ({
  useEu5Engine: () => ({ trigger: { clearMapProjection: vi.fn() } }),
  useEu5Input: () => ({ kind: "server" }),
  useEu5PlaythroughId: () => mocks.playthroughId,
}));
vi.mock("../features/profiles/useEu5Trigger", () => ({
  useEu5Trigger: () => ({ data: { version: "1.4.0", countryNames: {} } }),
}));
vi.mock("./currentSnapshot", () => ({ useCurrentHistorySnapshot: () => undefined }));
vi.mock("./analysisClient", () => ({
  campaignAnalysis: () => ({ clearCampaign: vi.fn(), exportObservations: vi.fn() }),
}));
vi.mock("./useAnalysisHistory", () => ({
  useCountryMarketCenters: () => null,
  useAnalysisHistory: (query: { campaignId: string }) => ({
    dates: mocks.snapshots.filter((s) => s.campaignId === query.campaignId),
    loading: false,
    error: null,
  }),
}));
vi.mock("./HistoryPlot", () => ({ HistoryPlot: () => null }));
vi.mock("./ContextGraphs", () => ({
  ContextGraphs: ({ dates }: { dates: Snapshot[] }) => (
    <div data-dates={dates.map((snapshot) => `${snapshot.date}@${snapshot.version}`).join(",")} />
  ),
}));
import { SaveHistory } from "./SaveHistory";

beforeEach(() => {
  mocks.playthroughId = "campaign";
  mocks.snapshots = [
    { campaignId: "campaign", version: "1.0.0", date: "1337-01-01" },
    { campaignId: "campaign", version: "1.4.0", date: "1338-01-01" },
    { campaignId: "other", version: "1.4.0", date: "1339-01-01" },
  ].map((snapshot, index) => ({
    ...snapshot,

    hash: `eu5:${index}`,
    fileName: "observer.eu5",
    dateSort: 13370101 + index * 10000,
    countries: [],
    markets: [],
    marketLabels: {},
    population: 100,
    development: 10,
  }));
});

it("charts one campaign across game updates and excludes other playthroughs", () => {
  const html = renderToString(<SaveHistory mapMode="population" />);
  expect(html).toContain('data-dates="1337-01-01@1.0.0,1338-01-01@1.4.0"');
  expect(html).not.toContain("1339-01-01");
  expect(html).not.toContain("Campaign / game version");
});

it("does not show cached observations when no campaign is open", () => {
  mocks.playthroughId = null;
  const html = renderToString(<SaveHistory mapMode="population" />);
  expect(html).toContain("Start with two or more saves");
  expect(html).not.toContain("data-dates");
});
