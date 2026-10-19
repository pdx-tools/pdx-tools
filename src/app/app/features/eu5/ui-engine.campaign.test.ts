import { expect, it, vi } from "vitest";
import { Eu5UIEngine } from "./ui-engine";
import type { GameInstance, PaletteGradients, TimelineData } from "./game-adapter";
import type { Eu5Carry } from "./campaignCarry";

it("publishes the restored map mode, date, selection and gradient together", async () => {
  const date = { year: 1340, month: 1, day: 1 };
  const selection = { preset: null };
  const restore = vi.fn(async () => ({
    change: { mapMode: "development", date, gradient: undefined },
    selection,
    profiles: [{ kind: "country", country: { key: 77, name: "France" } }],
  }));
  const game = {
    queries: {},
    commands: {},
    onHoverDisplayUpdate: vi.fn(),
    onSelectionUpdate: vi.fn(),
    onBoxSelectRectUpdate: vi.fn(),
    onCursorHintUpdate: vi.fn(),
    onViewportChange: vi.fn(),
    startHoverTracking: vi.fn(),
    restoreCampaignView: restore,
  } as unknown as GameInstance;
  const timeline: TimelineData = {
    available: false,
    start: date,
    end: date,
    changeDays: [],
    changeCounts: [],
    notes: [],
  };
  const engine = new Eu5UIEngine(game, {} as PaletteGradients, timeline);
  const listener = vi.fn();
  engine.subscribe(listener);
  const carry: Eu5Carry = {
    mapMode: "development",
    viewport: null,
    selection: null,
    insightPanel: { open: true, width: 640 },
  };
  expect(await engine.trigger.restoreCampaignView(carry)).toEqual([
    { kind: "country", country: { key: 77, name: "France" } },
  ]);
  expect(restore).toHaveBeenCalledExactlyOnceWith(carry);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(engine.state).toMatchObject({
    currentMapMode: "development",
    timelineDate: date,
    timelineMapDate: date,
    selectionState: selection,
    selectionRevision: 1,
    mapModeGradient: null,
  });
});
