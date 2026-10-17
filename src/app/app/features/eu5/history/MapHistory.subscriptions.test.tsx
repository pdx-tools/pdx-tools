import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type * as Zustand from "zustand";
import { beforeEach, expect, it, vi } from "vitest";
import { Eu5UIEngine } from "../ui-engine";
import type { AppState } from "../ui-engine";
import type { GameInstance, PaletteGradients, TimelineData } from "../game-adapter";
import { createEu5Store, Eu5Context } from "../store/eu5Store";
import type { Eu5Store } from "../store/eu5Store";
import { MapHistoryProvider, useMapHistory } from "./MapHistory";

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
vi.mock("@/features/account", () => ({ useIsDeveloper: () => false }));
vi.mock("@/features/campaign/CampaignProvider", () => ({ useCampaign: () => null }));
vi.mock("./CampaignAnalysis", () => ({ CampaignAnalysis: () => null }));
vi.mock("./analysisClient", () => ({
  campaignAnalysis: vi.fn(),
  connectAnalysisFrames: vi.fn(),
}));
vi.mock("./observationLoader", () => ({
  ensureObservationLoaded: vi.fn(),
  cancelObservationLoad: vi.fn(),
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
  return <span>{useMapHistory()?.preview?.hash ?? "live"}</span>;
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

beforeEach(() => subscriptions.splice(0));

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

it("still observes map modes, selections and new projected dates", () => {
  const store = historyStore();
  render(store);
  const before = store.getState();
  const updates: Partial<AppState>[] = [
    { currentMapMode: "control" },
    { selectionState: { isEmpty: false } as AppState["selectionState"] },
    {
      mapProjection: {
        hash: "later",
        date: { year: 1341, month: 4, day: 1 },
        world: before.world,
      },
    },
  ];
  for (const update of updates) {
    const after = { ...before, appState: { ...before.appState, ...update } };
    expect(subscriptions.some((select) => !Object.is(select(after), select(before)))).toBe(true);
  }
  store.setState({ appState: { ...before.appState, ...updates[2] } });
  expect(render(store)).toBe("<span>later</span>");
});
