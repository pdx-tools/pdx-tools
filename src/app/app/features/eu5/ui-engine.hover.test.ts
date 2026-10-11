import { expect, it, vi } from "vitest";
import { Eu5UIEngine } from "./ui-engine";
import type { GameInstance, PaletteGradients, TimelineData } from "./game-adapter";

it("ignores late hover events after a campaign save releases its worker", async () => {
  let released = false;
  const highlight = vi.fn(async () => {
    if (released) throw new Error("Proxy has been released and is not useable");
  });
  const clear = vi.fn(async () => {
    if (released) throw new Error("Proxy has been released and is not useable");
  });
  const game = {
    onHoverDisplayUpdate: vi.fn(),
    onSelectionUpdate: vi.fn(),
    onBoxSelectRectUpdate: vi.fn(),
    onCursorHintUpdate: vi.fn(),
    onViewportChange: vi.fn(),
    startHoverTracking: vi.fn(),
    stopHoverTracking: vi.fn(),
    release: vi.fn(() => {
      released = true;
    }),
    highlightMapHoverTarget: highlight,
    clearMapHoverHighlight: clear,
  } as unknown as GameInstance;
  const date = { year: 1340, month: 1, day: 1 };
  const timeline: TimelineData = {
    available: false,
    start: date,
    end: date,
    changeDays: [],
    changeCounts: [],
    notes: [],
  };
  const engine = new Eu5UIEngine(game, {} as PaletteGradients, timeline);
  const target = { kind: "location", locationIdx: 1 } as const;
  await engine.trigger.highlightMapHoverTarget(target);
  await engine.trigger.clearMapHoverHighlight();
  engine.destroy();
  await expect(engine.trigger.highlightMapHoverTarget(target)).resolves.toBeUndefined();
  await expect(engine.trigger.clearMapHoverHighlight()).resolves.toBeUndefined();
  expect(highlight).toHaveBeenCalledTimes(1);
  expect(clear).toHaveBeenCalledTimes(1);
});
