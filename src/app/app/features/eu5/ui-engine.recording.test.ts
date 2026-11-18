import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Eu5UIEngine } from "./ui-engine";
import type { GameInstance, PaletteGradients, TimelineData } from "./game-adapter";
import type { TimelapseFile, TimelapseFrameTiming, TimelapseOptions } from "@pdx.tools/timelapse";

vi.mock("@/features/timeline/datePlate", () => ({
  readDatePlateColors: () => ({ panel: "black", line: "white", year: "white", month: "white" }),
  readDatePlateFonts: () => ({ family: "monospace", stack: "monospace", faces: [] }),
}));
vi.mock("@/lib/log", () => ({ log: vi.fn() }));

const options: TimelapseOptions = { framing: "view", quality: "720p" };
const snapshots = [
  { id: "early", date: { year: 1337, month: 4, day: 1 } },
  { id: "late", date: { year: 1338, month: 4, day: 1 } },
];
const timing: TimelapseFrameTiming = { renderMs: 0, encodeMs: 0 };
const file: TimelapseFile = { blob: new Blob(["video"]), extension: "mp4" };

function recording() {
  const game = {
    queries: {},
    commands: {},
    onHoverDisplayUpdate: vi.fn(),
    onSelectionUpdate: vi.fn(),
    onBoxSelectRectUpdate: vi.fn(),
    onCursorHintUpdate: vi.fn(),
    onViewportChange: vi.fn(),
    startHoverTracking: vi.fn(),
    beginTimelapseRecording: vi.fn<GameInstance["beginTimelapseRecording"]>().mockResolvedValue({
      rect: { x: 0, y: 0, width: 1280, height: 720 },
      band: { width: 1280, height: 720 },
      offset: { x: 0, y: 0 },
    }),
    recordTimelapseFrame: vi.fn<GameInstance["recordTimelapseFrame"]>().mockResolvedValue(timing),
    finishTimelapseRecording: vi.fn(async () => file),
    endTimelapseRecording: vi.fn(async () => {}),
  };
  const timeline: TimelineData = {
    available: false,
    start: snapshots[0].date,
    end: snapshots[1].date,
    changeDays: [],
    changeCounts: [],
    notes: [],
  };
  const engine = new Eu5UIEngine(game as unknown as GameInstance, {} as PaletteGradients, timeline);
  const present = vi.fn(async (_id: string) => true);
  const start = () => engine.trigger.recordSavedDates(options, { snapshots, present });
  return { engine, game, present, start };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  vi.stubGlobal("document", { visibilityState: "visible" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("waits for the map and frame before advancing, and for the file before cleanup", async () => {
  const { engine, game, present, start } = recording();
  const accepted = Promise.withResolvers<boolean>();
  const recorded = Promise.withResolvers<TimelapseFrameTiming>();
  const finished = Promise.withResolvers<TimelapseFile>();
  present.mockReturnValueOnce(accepted.promise);
  game.recordTimelapseFrame.mockReturnValueOnce(recorded.promise);
  game.finishTimelapseRecording.mockReturnValueOnce(finished.promise);

  const result = start();
  await vi.advanceTimersByTimeAsync(1000);
  expect(present).toHaveBeenCalledExactlyOnceWith("early");
  expect(game.recordTimelapseFrame).not.toHaveBeenCalled();
  expect(game.beginTimelapseRecording).toHaveBeenCalledWith(
    expect.objectContaining({ framing: "view", output: { width: 1280, height: 720 } }),
  );

  accepted.resolve(true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(game.recordTimelapseFrame).toHaveBeenCalledExactlyOnceWith(snapshots[0].date, 30);
  expect(present).toHaveBeenCalledTimes(1);
  expect(game.finishTimelapseRecording).not.toHaveBeenCalled();

  recorded.resolve(timing);
  await vi.advanceTimersByTimeAsync(0);
  expect(present.mock.calls.map(([id]) => id)).toEqual(["early", "late"]);
  expect(game.recordTimelapseFrame.mock.calls).toEqual(snapshots.map(({ date }) => [date, 30]));
  expect(game.finishTimelapseRecording).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(999);
  expect(game.finishTimelapseRecording).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(engine.state.timelapse.status).toBe("encoding");
  expect(game.endTimelapseRecording).not.toHaveBeenCalled();
  finished.resolve(file);
  expect(await result).toBe(file);
  expect(game.endTimelapseRecording).toHaveBeenCalledOnce();
  expect(engine.state.timelapse.status).toBe("idle");
});

it("discards the export if the map refuses a date instead of recording the previous map", async () => {
  const { engine, game, present, start } = recording();
  present.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  const result = expect(start()).rejects.toThrow("The map showed a different date");
  await vi.runAllTimersAsync();
  await result;
  expect(game.recordTimelapseFrame).toHaveBeenCalledExactlyOnceWith(snapshots[0].date, 30);
  expect(game.finishTimelapseRecording).not.toHaveBeenCalled();
  expect(game.endTimelapseRecording).toHaveBeenCalledOnce();
  expect(engine.state.timelapse.status).toBe("idle");
});

it("stops between saved dates without producing a file", async () => {
  const { engine, game, present, start } = recording();
  const result = start();
  await vi.advanceTimersByTimeAsync(0);
  engine.trigger.stopTimelapse();
  await vi.runAllTimersAsync();
  expect(await result).toBeNull();
  expect(present).toHaveBeenCalledExactlyOnceWith("early");
  expect(game.finishTimelapseRecording).not.toHaveBeenCalled();
  expect(game.endTimelapseRecording).toHaveBeenCalledOnce();
});

it("refuses a concurrent export without closing the active recording", async () => {
  const { game, start } = recording();
  const result = start();
  await expect(start()).rejects.toThrow("A timelapse recording is already running");
  expect(game.endTimelapseRecording).not.toHaveBeenCalled();
  await vi.runAllTimersAsync();
  expect(await result).toBe(file);
  expect(game.beginTimelapseRecording).toHaveBeenCalledOnce();
});

it("releases a failed recording and permits another export", async () => {
  const { engine, game, start } = recording();
  const error = Error("Recording failed");
  game.finishTimelapseRecording.mockRejectedValueOnce(error);
  const result = expect(start()).rejects.toBe(error);
  await vi.runAllTimersAsync();
  await result;
  expect(game.endTimelapseRecording).toHaveBeenCalledOnce();
  expect(engine.state.timelapse.status).toBe("idle");

  const retry = start();
  await vi.runAllTimersAsync();
  expect(await retry).toBe(file);
});
