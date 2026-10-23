import { beforeEach, expect, it, vi } from "vitest";
import type { OverlayReply } from "../workers/game/game-module";
import type { AppTriggers, TimelapseRecording } from "../ui-engine";
import type { RecordingEngine } from "./previewSession";

const mocks = vi.hoisted(() => ({
  present: vi.fn<AppTriggers["presentOverlay"]>(),
  clear: vi.fn<AppTriggers["clearOverlay"]>(),
  gate: vi.fn<AppTriggers["setInputGate"]>(),
  record: vi.fn<AppTriggers["recordSavedDates"]>(),
}));

vi.mock("../store/eu5Session", () => ({
  activeEu5Store: () => ({ getState: () => ({ engine }) }),
  subscribeEu5Session: () => () => {},
}));
vi.mock("../campaignCarry", () => ({ captureEu5Carry: vi.fn() }));
vi.mock("./analysisClient", () => ({ connectAnalysisFrames: async () => () => {} }));

import {
  previewSnapshot,
  recordSavedDates,
  setPreviewPlayback,
  usePreviewPlayback,
  usePreviewRecording,
  usePreviewSession,
} from "./previewSession";

const engine: RecordingEngine = {
  trigger: {
    connectMapFrames: async () => {},
    presentOverlay: mocks.present,
    stopOverlay: async () => {},
    clearOverlay: mocks.clear,
    setInputGate: mocks.gate,
    recordSavedDates: mocks.record,
  },
};
const snapshots = [
  { id: "a", date: { year: 1360, month: 1, day: 1 } },
  { id: "b", date: { year: 1361, month: 1, day: 1 } },
];
const options = { framing: "world", quality: "720p" } as const;
const file: TimelapseRecording = { blob: new Blob(["video"]), extension: "mp4" };
const reply = (snapshotId: string): OverlayReply => ({
  accepted: true,
  gradient: null,
  observation: {
    id: snapshotId,
    game: "eu5",
    campaignId: "campaign",
    contentHash: snapshotId,
    date: snapshotId === "a" ? "1360-01-01" : "1361-01-01",
    dateSort: snapshotId === "a" ? 13600101 : 13610101,
    gameVersion: "1.0",
    artifacts: ["observations", "map"],
    layoutKey: "layout",
    world: { locationCount: 1, countryCount: 1, totalPopulation: 1 },
  },
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.present.mockImplementation(async (id) => reply(id));
  mocks.clear.mockResolvedValue();
  mocks.gate.mockResolvedValue();
  usePreviewSession.setState({ kind: "live" }, true);
  usePreviewRecording.setState({ date: null, gradient: null });
  setPreviewPlayback(null);
});

it("restores live map input when recording fails", async () => {
  const finished = Promise.withResolvers<void>();
  mocks.record.mockImplementationOnce(async (_options, { present }) => {
    await present("b");
    await finished.promise;
    throw Error("Encoder failed");
  });
  setPreviewPlayback("control");
  const result = expect(recordSavedDates(engine, snapshots, "control", options)).rejects.toThrow(
    "Encoder failed",
  );
  await vi.waitFor(() => expect(usePreviewRecording.getState().date).toEqual(snapshots[1].date));
  expect(usePreviewPlayback.getState().mode).toBeNull();
  expect(mocks.gate).toHaveBeenCalledExactlyOnceWith(expect.any(Function));
  expect(mocks.clear).not.toHaveBeenCalled();

  finished.resolve();
  await result;

  expect(usePreviewRecording.getState().date).toBeNull();
  expect(mocks.clear).toHaveBeenCalledOnce();
  expect(mocks.clear.mock.calls[0][0]).toBeGreaterThan(mocks.present.mock.calls[0][2]);
  expect(mocks.gate).toHaveBeenLastCalledWith(null);
});

it("restores an existing preview after recording", async () => {
  previewSnapshot(engine, "campaign", "b", "control");
  await vi.waitFor(() =>
    expect(usePreviewSession.getState()).toMatchObject({ shown: { snapshotId: "b" } }),
  );
  mocks.record.mockImplementationOnce(async (_options, { present }) => {
    await present("a");
    return file;
  });

  expect(await recordSavedDates(engine, snapshots, "control", options)).toBe(file);

  await vi.waitFor(() =>
    expect(mocks.present.mock.calls.map(([id]) => id)).toEqual(["b", "a", "b"]),
  );
  expect(usePreviewRecording.getState().date).toBeNull();
  expect(usePreviewSession.getState()).toMatchObject({ kind: "preview", snapshotId: "b" });
  expect(mocks.clear).not.toHaveBeenCalled();
  expect(mocks.gate).toHaveBeenCalledExactlyOnceWith(expect.any(Function));
});
