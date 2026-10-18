import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type * as React from "react";
import type * as HistoryStore from "./store";

const mocks = vi.hoisted(() => ({
  injectedLayout: false,
  opening: null as string | null,
  engine: {
    trigger: { pauseTimeline: vi.fn(), showMapProjection: vi.fn(async () => {}) },
    getState: () => ({ currentMapMode: "control" }),
  },
  load: vi.fn(async () => {}),
  active: null as null | { getState: () => unknown },
  connect: vi.fn(async () => () => {}),
}));
vi.mock("react", async (original) => {
  const react = await original<typeof React>();
  return {
    ...react,
    useState: (initial: unknown) => {
      // Seed layout discovery, whose effect does not run during SSR.
      if (initial === null && !mocks.injectedLayout) {
        mocks.injectedLayout = true;
        return react.useState({ engine: mocks.engine, key: "layout" });
      }
      return react.useState(initial);
    },
  };
});
vi.mock("@/features/account", () => ({ useIsDeveloper: () => true }));
vi.mock("@/features/campaign/CampaignProvider", () => ({
  useCampaign: () => ({ opening: mocks.opening, saves: [] }),
}));
vi.mock("@/features/campaign/localSaves", () => ({
  localSaveRegistry: { useEntries: () => [] },
  holdsRef: () => false,
}));
vi.mock("../store", () => ({
  activeEu5Store: () => mocks.active,
  useEu5Engine: () => mocks.engine,
  useEu5MapMode: () => "control",
  useEu5MapProjection: () => ({ hash: "first", date: { year: 1337, month: 1, day: 1 } }),
  useEu5SelectionState: () => null,
  useEu5PlaythroughId: () => "campaign",
  useEu5SaveDate: () => ({ year: 1337, month: 1, day: 1 }),
  useEu5Input: () => ({ kind: "server" }),
  useEu5SaveInput: () => ({ kind: "server" }),
  useSetEu5InsightPanelOpen: () => vi.fn(),
}));
vi.mock("./CampaignAnalysis", () => ({ CampaignAnalysis: () => null }));
vi.mock("./analysisClient", () => ({
  campaignAnalysis: vi.fn(),
  connectAnalysisFrames: mocks.connect,
}));
vi.mock("./observationLoader", () => ({
  ensureObservationLoaded: mocks.load,
  cancelObservationLoad: vi.fn(async () => {}),
}));
vi.mock("./store", async (original) => {
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
import { MapHistoryProvider, useMapHistory } from "./MapHistory";
import { useHistory } from "./store";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.injectedLayout = false;
  mocks.opening = null;
  mocks.active = null;
  useHistory.setState({
    analysisEnabledCampaigns: ["campaign"],
    selectedObservations: { campaign: "first" },
    snapshots: ["first", "second"].map((hash, index) => ({
      hash,
      campaignId: "campaign",
      layoutKey: "layout",
      version: "1.0.0",
      fileName: "save.eu5",
      date: `${1337 + index}-01-01`,
      dateSort: (1337 + index) * 10000 + 101,
      world: { locationCount: 1, countryCount: 1, totalPopulation: 10 },
      marketLabels: {},
      population: 10,
      development: 1,
    })),
  });
});

function render() {
  const receive = vi.fn<(value: ReturnType<typeof useMapHistory>) => void>();
  function Capture() {
    receive(useMapHistory());
    return null;
  }
  renderToStaticMarkup(
    <MapHistoryProvider>
      <Capture />
    </MapHistoryProvider>,
  );
  return receive.mock.calls[0][0]!;
}

it.each([false, true])(
  "rejects a pending paint only when its selection is cancelled (cancelled: %s)",
  async (cancelled) => {
    render().controller!.step("day", 1);
    if (cancelled) useHistory.setState({ selectedObservations: {} });
    await Promise.resolve();
    expect(mocks.engine.trigger.showMapProjection).toHaveBeenCalledTimes(cancelled ? 0 : 1);
  },
);

it.each([null, "previous-save"])(
  "does not start idle settling over another navigation (opening: %s)",
  async (opening) => {
    mocks.opening = opening;
    await render().inspect();
    expect(mocks.load).toHaveBeenCalledTimes(opening === null ? 1 : 0);
  },
);

it("does not restore an old projection when a cancelled settlement fails late", async () => {
  const failure = Promise.withResolvers<void>();
  mocks.load.mockReturnValueOnce(failure.promise);
  const settlement = render().inspect();
  useHistory.setState({ selectedObservations: {} });
  mocks.active = { getState: () => ({ playthroughId: "campaign", engine: mocks.engine }) };
  failure.reject(new Error("Worker failed after navigation"));
  await settlement;
  expect(mocks.connect).not.toHaveBeenCalled();
  expect(mocks.engine.trigger.showMapProjection).not.toHaveBeenCalled();
});
