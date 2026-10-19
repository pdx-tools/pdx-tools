import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type * as Zustand from "zustand";
import { beforeEach, expect, it, vi } from "vitest";
import { Eu5UIEngine } from "../ui-engine";
import type { GameInstance, PaletteGradients, TimelineData } from "../game-adapter";
import { createEu5Store, Eu5Context } from "../store/eu5Store";
import type { Eu5Store } from "../store/eu5Store";
import { CampaignAnalysisProvider } from "./CampaignAnalysisProvider";
import { MapHistoryProvider } from "./MapHistory";
import { useMapHistory } from "./context";

const feature = vi.hoisted(() => ({ enabled: false }));

type State = ReturnType<Eu5Store["getState"]>;
const subscriptions: Array<(state: State) => unknown> = [];

// Capture the snapshots React subscribes to, without requiring a browser or
// timing-dependent performance assertions. Other stores keep their real hooks.
vi.mock("zustand", async (original) => ({
  ...(await original<typeof Zustand>()),
  useStore: (store: Eu5Store, select: (state: State) => unknown) => {
    subscriptions.push(select);
    return select(store.getState());
  },
}));
vi.mock("@/features/account", () => ({ useIsDeveloper: () => feature.enabled }));
vi.mock("@/features/campaign/CampaignProvider", () => ({ useCampaign: () => null }));
vi.mock("./CampaignAnalysis", () => ({ CampaignAnalysis: () => null }));
vi.mock("./analysisClient", () => ({
  clearAnalysis: vi.fn(),
  connectAnalysisFrames: vi.fn(),
}));
vi.mock("./previewSession", () => ({
  usePreviewSession: () => ({ kind: "live" }),
  usePreviewPlayback: (select: (playback: { mode: null }) => unknown) => select({ mode: null }),
  setPreviewPlayback: vi.fn(),
  bindPreviewNavigation: vi.fn(),
  cancelPreview: vi.fn(),
  connectFrames: vi.fn(),
  loadedSnapshotId: () => undefined,
  openPreview: vi.fn(),
  previewSnapshot: vi.fn(),
  repaintPreview: vi.fn(),
}));
vi.mock("../store", async () => ({
  ...(await import("../store/eu5Store")),
  activeEu5Store: () => null,
}));

function historyStore() {
  const date = { year: 1340, month: 4, day: 1 };
  const timeline: TimelineData = {
    available: false,
    start: date,
    end: date,
    changeDays: [],
    changeCounts: [],
    notes: [],
  };
  const game = {
    queries: {},
    commands: {},
    onHoverDisplayUpdate: vi.fn(),
    onSelectionUpdate: vi.fn(),
    onBoxSelectRectUpdate: vi.fn(),
    onCursorHintUpdate: vi.fn(),
    onViewportChange: vi.fn(),
    startHoverTracking: vi.fn(),
  } as unknown as GameInstance;
  const engine = new Eu5UIEngine(game, {} as PaletteGradients, timeline);
  const input = { kind: "file", file: new File(["save"], "save.eu5") } as const;
  return createEu5Store({
    input,
    saveInput: input,
    opened: {
      engine,
      saveDate: date,
      playthroughId: null,
      playthroughName: "Campaign",
      multiplayer: false,
      players: [],
      world: { locationCount: 1, countryCount: 1, totalPopulation: 10 },
    },
  });
}

function Preview() {
  const history = useMapHistory();
  return <span>{history ? (history.preview ? "preview" : "live") : "none"}</span>;
}

function render(store: Eu5Store) {
  return renderToStaticMarkup(
    <Eu5Context.Provider value={store}>
      <MapHistoryProvider>
        <Preview />
      </MapHistoryProvider>
    </Eu5Context.Provider>,
  );
}

beforeEach(() => {
  subscriptions.splice(0);
  feature.enabled = false;
});

it("keeps history subscriptions stable for hover and camera updates with analysis disabled", () => {
  const store = historyStore();
  expect(render(store)).toBe("<span>live</span>");
  const before = store.getState();
  const after: State = {
    ...before,
    appState: {
      ...before.appState,
      hoverDisplayData: { kind: "clear" },
      cursorHint: "move",
      mapViewport: {
        world: { width: 100, height: 100 },
        viewport: { x: 5, y: 10, width: 50, height: 50 },
      },
    },
  };
  expect(subscriptions.length).toBeGreaterThan(0);
  for (const select of subscriptions) expect(select(after)).toBe(select(before));
});

it("still observes map modes and engine changes", () => {
  const store = historyStore();
  render(store);
  const before = store.getState();
  const updates: Partial<State>[] = [
    { appState: { ...before.appState, currentMapMode: "markets" } },
    { engine: historyStore().getState().engine },
  ];
  for (const update of updates) {
    const after = { ...before, ...update };
    expect(subscriptions.some((select) => !Object.is(select(after), select(before)))).toBe(true);
  }
});

it("does not mount campaign history for an ordinary user", () => {
  // There is deliberately no EU5 store: mounting the provider would subscribe to it and fail.
  expect(
    renderToStaticMarkup(
      <CampaignAnalysisProvider>
        <Preview />
      </CampaignAnalysisProvider>,
    ),
  ).toBe("<span>none</span>");
  expect(subscriptions).toHaveLength(0);
});

it("loads campaign history behind the developer flag without activating analysis", async () => {
  feature.enabled = true;
  const store = historyStore();
  const page = () =>
    renderToStaticMarkup(
      <Eu5Context.Provider value={store}>
        <CampaignAnalysisProvider>
          <Preview />
        </CampaignAnalysisProvider>
      </Eu5Context.Provider>,
    );
  // The page shows at once, and the history follows when its module loads.
  expect(page()).toBe("<span>none</span>");
  await import("./MapHistory");
  await vi.waitFor(() => expect(page()).toBe("<span>live</span>"));
  expect(subscriptions.length).toBeGreaterThan(0);
});
