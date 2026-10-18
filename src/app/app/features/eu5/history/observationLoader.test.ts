import { beforeEach, expect, it, vi } from "vitest";
import type { CampaignNav } from "@/features/campaign/useCampaignNav";
import type { CampaignSave } from "@/features/campaign/types";
import { useHistory } from "./store";
const mocks = vi.hoisted(() => ({ active: vi.fn(), get: vi.fn(), capture: vi.fn() }));
vi.mock("../store", () => ({ activeEu5Store: mocks.active }));
vi.mock("../campaignCarry", () => ({ captureEu5Carry: mocks.capture }));
vi.mock("@/features/campaign/localSaves", () => ({
  localSaveRegistry: { get: mocks.get },
  holdsRef: (entry: { ref: { file: unknown } }, ref: { file: unknown }) =>
    entry.ref.file === ref.file,
}));
import { ensureObservationLoaded, cancelObservationLoad } from "./observationLoader";
const files = [
  new File(["first"], "first.eu5", { lastModified: 1 }),
  new File(["second"], "second.eu5", { lastModified: 2 }),
];
const targets = files.map((file, i) => ({
  key: String(i),
  name: file.name,
  source: { kind: "local", entryId: String(i), uploadedBy: null },
  date: { year: 1360, month: 1, day: i + 1 },
  membership: "same",
  problem: null,
  isOpen: i === 0,
})) as CampaignSave[];
let state: {
  input: { kind: "file"; file: File };
  saveInput: { kind: "file"; file: File };
  playthroughId: string;
  appState: { currentMapMode: "control"; mapViewport: null };
  insightPanelOpen: boolean;
  insightPanelWidth: number;
  engine: {
    trigger: {
      stopMapProjection: ReturnType<typeof vi.fn>;
      clearMapProjection: ReturnType<typeof vi.fn>;
      replayMapInteraction: ReturnType<typeof vi.fn>;
    };
  };
  setInsightPanelOpen: ReturnType<typeof vi.fn>;
};
let navigation: CampaignNav;
beforeEach(() => {
  vi.resetAllMocks();
  state = {
    input: { kind: "file", file: files[0] },
    saveInput: { kind: "file", file: files[0] },
    playthroughId: "campaign",
    appState: { currentMapMode: "control", mapViewport: null },
    insightPanelOpen: false,
    insightPanelWidth: 640,
    engine: {
      trigger: {
        stopMapProjection: vi.fn().mockResolvedValue(undefined),
        clearMapProjection: vi.fn().mockResolvedValue(undefined),
        replayMapInteraction: vi.fn().mockResolvedValue(undefined),
      },
    },
    setInsightPanelOpen: vi.fn(),
  };
  mocks.active.mockImplementation(() => ({ getState: () => state }));
  mocks.get.mockImplementation((id: string) => ({
    id,
    ref: { kind: "file", file: files[Number(id)] },
  }));
  mocks.capture.mockResolvedValue({
    mapMode: "control",
    selection: null,
    viewport: null,
    insightPanel: { open: false, width: 640 },
  });
  navigation = {
    saves: targets,
    open: vi.fn().mockImplementation(async (target: CampaignSave) => {
      if (target.source.kind === "local") {
        const file = files[Number(target.source.entryId)];
        state.input = { kind: "file", file };
        state.saveInput = { kind: "file", file };
      }
      return { kind: "navigated" };
    }),
  } as unknown as CampaignNav;
  useHistory.setState({
    selectedObservations: { campaign: "first" },
    previewCarries: {},
    settlingObservation: null,
    sources: Object.fromEntries(
      files.map((file, i) => [
        String(i),
        {
          hash: i === 0 ? "first" : "second",
          version: { size: file.size, lastModified: file.lastModified },
        },
      ]),
    ),
  });
});
it("restores an already-open save without parsing or opening the detail panel", async () => {
  await ensureObservationLoaded("campaign", "first", navigation);
  expect(navigation.open).not.toHaveBeenCalled();
  expect(mocks.capture).not.toHaveBeenCalled();
  expect(state.engine.trigger.clearMapProjection).toHaveBeenCalledOnce();
  expect(state.setInsightPanelOpen).not.toHaveBeenCalled();
  expect(useHistory.getState().settlingObservation).toBeNull();
});
it("loads the selected observation while preserving closed panels and the map mode", async () => {
  useHistory.setState({ selectedObservations: { campaign: "second" } });
  await ensureObservationLoaded("campaign", "second", navigation);
  expect(navigation.open).toHaveBeenCalledWith(
    expect.objectContaining({ key: "1", isOpen: false }),
    expect.objectContaining({
      payload: expect.objectContaining({
        mapMode: "control",
        insightPanel: { open: false, width: 640 },
      }),
    }),
  );
  expect(state.setInsightPanelOpen).not.toHaveBeenCalled();
});
it("rejects modified files before replacing the active save", async () => {
  useHistory.setState({
    sources: { "0": { hash: "first", version: { size: files[0].size, lastModified: 999 } } },
  });
  await expect(ensureObservationLoaded("campaign", "first", navigation)).rejects.toThrow(
    "save changed",
  );
  expect(navigation.open).not.toHaveBeenCalled();
  expect(state.engine.trigger.clearMapProjection).not.toHaveBeenCalled();
});
it("preserves explicit gesture inspection after loading the original save", async () => {
  const interaction = {
    kind: "click" as const,
    event: { kind: "update" as const, locationIdx: 42, modifiers: 0 },
  };
  await ensureObservationLoaded("campaign", "first", navigation, interaction);
  expect(state.engine.trigger.replayMapInteraction).toHaveBeenCalledExactlyOnceWith(interaction);
  expect(state.setInsightPanelOpen).toHaveBeenCalledExactlyOnceWith(true);
});
it("ignores a superseded loading completion and then services the latest selection", async () => {
  const gate = Promise.withResolvers<{ kind: "navigated" }>();
  vi.mocked(navigation.open).mockImplementationOnce(() => gate.promise);
  useHistory.setState({ selectedObservations: { campaign: "second" } });
  const old = ensureObservationLoaded("campaign", "second", navigation);
  const rejected = expect(old).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(navigation.open).toHaveBeenCalledOnce());
  useHistory.setState({ selectedObservations: { campaign: "first" } });
  cancelObservationLoad("campaign");
  const latest = ensureObservationLoaded("campaign", "first", navigation);
  gate.resolve({ kind: "navigated" });
  await rejected;
  await latest;
  expect(state.engine.trigger.clearMapProjection).toHaveBeenCalledOnce();
  expect(state.setInsightPanelOpen).not.toHaveBeenCalled();
});

it.each(["clearing", "inspection"] as const)(
  "retains the original carry when a date changes during %s",
  async (stage) => {
    const original = {
      mapMode: "control" as const,
      selection: { kind: "country" as const, tag: "FRA", focusedLocation: null },
      viewport: null,
      insightPanel: { open: false, width: 640 },
    };
    useHistory.setState({ previewCarries: { campaign: original } });
    const gate = Promise.withResolvers<void>();
    const pending =
      stage === "clearing"
        ? state.engine.trigger.clearMapProjection
        : state.engine.trigger.replayMapInteraction;
    pending.mockReturnValueOnce(gate.promise);
    const interaction = {
      kind: "click" as const,
      event: { kind: "update" as const, locationIdx: 42, modifiers: 0 },
    };
    const request = ensureObservationLoaded("campaign", "first", navigation, interaction);
    const rejected = expect(request).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(pending).toHaveBeenCalledOnce());
    useHistory.setState({ selectedObservations: { campaign: "second" } });
    cancelObservationLoad("campaign");
    gate.resolve();
    await rejected;
    expect(useHistory.getState().previewCarries.campaign).toEqual(original);
    expect(state.setInsightPanelOpen).not.toHaveBeenCalled();
    if (stage === "clearing")
      expect(state.engine.trigger.replayMapInteraction).not.toHaveBeenCalled();
  },
);
