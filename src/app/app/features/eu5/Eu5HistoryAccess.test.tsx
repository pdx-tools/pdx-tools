import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type * as Eu5Store from "./store";
import type * as HistoryStore from "./history/store";

const mocks = vi.hoisted(() => ({
  developer: false,
  historyPanel: vi.fn(() => <p>History content</p>),
  historyQuery: vi.fn(() => ({ dates: [] })),
}));
vi.mock("@/features/account", () => ({ useIsDeveloper: () => mocks.developer }));
vi.mock("@/features/campaign/CampaignProvider", () => ({ useCampaign: () => ({ saves: [] }) }));
vi.mock("./history/context", () => ({
  useMapHistory: () => ({ enabled: false, controller: null, readyHashes: new Set() }),
}));
vi.mock("./history/SaveHistory", () => ({ SaveHistory: mocks.historyPanel }));
vi.mock("./history/useAnalysisHistory", () => ({ useAnalysisHistory: mocks.historyQuery }));
vi.mock("./history/currentSnapshot", () => ({ useCurrentHistorySnapshot: () => undefined }));
vi.mock("./features/insights/Political", () => ({
  PoliticalInsight: () => <p>Current save overview</p>,
}));
vi.mock("./features/profiles/useEu5Trigger", () => ({
  useEu5Trigger: () => ({ data: undefined }),
}));
vi.mock("./store", async (original) => ({
  ...(await original<typeof Eu5Store>()),
  useEu5MapMode: () => "political",
  useEu5SaveDate: () => ({ year: 1337, month: 1, day: 1 }),
  useEu5PlaythroughId: () => "campaign",
  useEu5SelectionState: () => null,
  useEu5TimelineLive: () => true,
  useEu5World: () => ({ locationCount: 1, countryCount: 1 }),
  useEu5UserSelectionRevision: () => 0,
  useSetEu5InsightPanelWidth: () => vi.fn(),
  useSetEu5InsightPanelOpen: () => vi.fn(),
  useSetEu5TimelineBarHeight: () => vi.fn(),
}));
vi.mock("./history/store", async (original) => {
  const actual = await original<typeof HistoryStore>();
  return {
    ...actual,
    useHistory: Object.assign(
      (select: (state: ReturnType<typeof actual.useHistory.getState>) => unknown) =>
        select(actual.useHistory.getState()),
      actual.useHistory,
    ),
  };
});
vi.mock("./timeline/useTimelineController", () => ({
  useTimelineController: () => ({ timeline: { start: { year: 1337, month: 1, day: 1 } } }),
}));
vi.mock("@/features/timeline/controller", () => ({ useTimelineKeyboard: vi.fn() }));
vi.mock("@/features/campaign/SaveMarks", () => ({ useTimelineCampaign: () => null }));
vi.mock("@/features/timeline/TimelineTransport", () => ({
  TimelineTransport: () => <span>Political timeline controls</span>,
}));
vi.mock("@/features/timeline/TimelineReadout", () => ({ TimelineReadout: () => null }));
vi.mock("@/features/timeline/TimelineScrubber", () => ({ TimelineScrubber: () => null }));
vi.mock("./timeline/TimelapseExport", () => ({ TimelapseExport: () => null }));
vi.mock("./useViewportInsets", () => ({
  useViewportInsets: () => ({ left: 0, right: 0, top: 0, bottom: 0 }),
}));

import { useHistory } from "./history/store";
import { Eu5InsightPanel } from "./Eu5InsightPanel";
import { TimelineBar } from "./timeline/TimelineBar";

beforeEach(() => {
  mocks.developer = false;
  mocks.historyPanel.mockClear();
  mocks.historyQuery.mockClear();
  useHistory.setState({ panelOpen: false, viewedProfiles: [], snapshots: [] });
});

it.each([false, true])(
  "hides analytical panel entry points for ordinary users (previously open: %s)",
  (panelOpen) => {
    useHistory.setState({ panelOpen });
    const html = renderToStaticMarkup(<Eu5InsightPanel open onClose={() => {}} />);
    expect(html).toContain("Current save overview");
    expect(html).not.toContain("Over time");
    expect(html).not.toContain("Campaign history");
    expect(mocks.historyPanel).not.toHaveBeenCalled();
    expect(mocks.historyQuery).not.toHaveBeenCalled();
  },
);

it("keeps campaign history accessible to developers", () => {
  mocks.developer = true;
  useHistory.setState({ panelOpen: true });
  const html = renderToStaticMarkup(<Eu5InsightPanel open onClose={() => {}} />);
  expect(html).toContain("Over time");
  expect(html).toContain("History content");
  expect(mocks.historyPanel).toHaveBeenCalled();
});

it.each([false, true])(
  "gates the timeline history button without hiding political playback (developer: %s)",
  (developer) => {
    mocks.developer = developer;
    const html = renderToStaticMarkup(<TimelineBar />);
    expect(html).toContain("Political timeline controls");
    expect(html.includes("Over time")).toBe(developer);
  },
);
