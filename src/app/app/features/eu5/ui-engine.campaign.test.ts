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
  await engine.trigger.restoreCampaignView(carry);
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

it("settles a pending seek before changing modes and restores the date once", async () => {
  const start = { year: 1337, month: 4, day: 1 };
  const end = { year: 1340, month: 4, day: 1 };
  const change = {
    colorsChanged: false,
    flagsChanged: false,
    gradient: undefined,
    selectionChanged: false,
  };
  const seek = Promise.withResolvers<Awaited<ReturnType<GameInstance["setTimelineDate"]>>>();
  const setTimelineDate = vi
    .fn<GameInstance["setTimelineDate"]>()
    .mockReturnValueOnce(seek.promise)
    .mockImplementation(async (date) => ({ ...change, mapMode: "political", date }));
  const setMapMode = vi
    .fn<GameInstance["setMapMode"]>()
    .mockImplementation(async (mapMode) => ({ ...change, mapMode, date: end }));
  const game = {
    onHoverDisplayUpdate: vi.fn(),
    onSelectionUpdate: vi.fn(),
    onBoxSelectRectUpdate: vi.fn(),
    onCursorHintUpdate: vi.fn(),
    onViewportChange: vi.fn(),
    startHoverTracking: vi.fn(),
    setTimelineDate,
    setMapMode,
  } as unknown as GameInstance;
  const engine = new Eu5UIEngine(game, {} as PaletteGradients, {
    available: true,
    start,
    end,
    changeDays: [],
    changeCounts: [],
    notes: [],
  });

  engine.trigger.setTimelineDate(start);
  const switchMode = engine.trigger.selectMapMode("control");
  const switchBack = engine.trigger.selectMapMode("political");
  await Promise.resolve();
  expect(setMapMode).not.toHaveBeenCalled();

  seek.resolve({ ...change, mapMode: "political", date: start });
  await switchMode;
  expect(engine.state.timelineMapDate).toEqual(end);
  await switchBack;
  expect(engine.state.timelineMapDate).toEqual(start);
  expect(setMapMode).toHaveBeenCalledExactlyOnceWith("control");
  expect(setTimelineDate.mock.calls).toEqual([[start], [start]]);
});
