import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type * as Zustand from "zustand";
import type { CampaignNav } from "@/features/campaign/useCampaignNav";
import type { CampaignAdapter } from "@/features/campaign/useCampaignNav";
import type { OpenSave } from "@/features/campaign/types";
import type { Eu5SaveInput } from "./store/types";
import type { LocalSaveRegistry } from "@/features/campaign/localSaves";
import type * as LocalSaves from "@/features/campaign/localSaves";
import type { OverlayReply } from "./workers/game/game-module";
import type { LocationClickChangeEvent } from "./workers/map/map-module";
import type { MapMode } from "@/wasm/wasm_eu5";
import type { Eu5Carry } from "./campaignCarry";

const mocks = vi.hoisted(() => ({
  registry: null as LocalSaveRegistry | null,
  receive: vi.fn<(nav: CampaignNav | null) => void>(),
  step: vi.fn<(input: Eu5SaveInput) => Promise<void>>(),
  present: vi.fn<(snapshotId: string, mode: MapMode, token: number) => Promise<OverlayReply>>(),
  stop: vi.fn(async () => {}),
  clear: vi.fn<(token: number) => Promise<void>>(async () => {}),
  gate: vi.fn<(onClick: ((event: LocationClickChangeEvent) => void) | null) => Promise<void>>(
    async () => {},
  ),
  restore: vi.fn<(carry: Eu5Carry) => Promise<void>>(async () => {}),
  capture: vi.fn(async () => ({
    mapMode: "control" as const,
    selection: { kind: "country" as const, tag: "FRA", focusedLocation: null },
    viewport: null,
    insightPanel: { open: false, width: 640 },
  })),
  fileInput: vi.fn(),
}));
vi.mock("zustand", async (original) => ({
  ...(await original<typeof Zustand>()),
  useStore: (store: { getState: () => unknown }, select: (state: unknown) => unknown) =>
    select(store.getState()),
}));
vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/" }),
}));
vi.mock("@/features/account", () => ({ useSession: () => ({ id: null }) }));
vi.mock("@/features/engine", () => ({ useEngineActions: () => ({ fileInput: mocks.fileInput }) }));
vi.mock("@/lib/captureException", () => ({ captureException: vi.fn() }));
vi.mock("@/services/appApi", () => ({
  pdxApi: { saves: { useCampaign: () => ({ data: { saves: [] } }) } },
}));
vi.mock("@/features/campaign/reader", () => ({ readSaveIdentity: vi.fn() }));
vi.mock("@/features/campaign/localSaves", async (original) => {
  const actual = await original<typeof LocalSaves>();
  return {
    ...actual,
    localSaveRegistry: new Proxy({} as LocalSaveRegistry, {
      get: (_, key) => Reflect.get(mocks.registry!, key),
    }),
  };
});
vi.mock("@/features/campaign/CampaignProvider", () => ({
  CampaignProvider: ({ open, adapter }: { open: OpenSave; adapter: CampaignAdapter }) => {
    mocks.receive(useCampaignNav(open, adapter, null));
    return null;
  },
}));
vi.mock("./campaignCarry", () => ({ captureEu5Carry: mocks.capture }));
vi.mock("./history/analysisClient", () => ({ connectAnalysisFrames: async () => () => {} }));
vi.mock("./store/eu5Session", () => ({
  activeEu5Store: () => store,
  subscribeEu5Session: () => () => {},
}));
vi.mock("./store", () => ({
  useEu5Context: () => store,
  activeEu5Store: () => store,
  useEu5Input: () => state.input,
  useEu5SaveInput: () => state.saveInput,
  useEu5Multiplayer: () => false,
  useEu5PlaythroughId: () => "campaign",
  useEu5SaveDate: () => ({ year: 1363, month: 1, day: 1 }),
  useSaveFilename: () => state.input.file.name,
  stepEu5Session: mocks.step,
}));
import { createLocalSaveRegistry } from "@/features/campaign/localSaves";
import { toPlaythroughId } from "@/features/campaign/types";
import { campaignTransitions } from "@/features/campaign/transitions";
import { useCampaignNav } from "@/features/campaign/useCampaignNav";
import { useHistory } from "./history/store";
import {
  bindPreviewNavigation,
  cancelPreview,
  openPreview,
  previewSnapshot,
  setPreviewPlayback,
  usePreviewPlayback,
  usePreviewSession,
} from "./history/previewSession";
import type { PreviewEngine } from "./history/previewSession";
import type { AppTriggers } from "./ui-engine";
import { Eu5CampaignProvider } from "./campaign";

const snapshotIds = ["a", "b", "c", "current"];
const files = snapshotIds.map(
  (name, index) => new File([name], `${name}.eu5`, { lastModified: index + 1 }),
);
const engine: PreviewEngine & { trigger: Pick<AppTriggers, "restoreCampaignView"> } = {
  trigger: {
    connectMapFrames: async () => {},
    presentOverlay: mocks.present,
    stopOverlay: mocks.stop,
    clearOverlay: mocks.clear,
    setInputGate: mocks.gate,
    restoreCampaignView: mocks.restore,
  },
};
let state: {
  input: { kind: "file"; file: File };
  saveInput: { kind: "file"; file: File };
  playthroughId: string;
  appState: { currentMapMode: "control"; mapViewport: null };
  engine: typeof engine;
  insightPanelOpen: boolean;
  insightPanelWidth: number;
  setInsightPanelOpen: (open: boolean) => void;
};
const store = { getState: () => state };

const reply = (snapshotId: string, accepted = true): OverlayReply => ({
  accepted,
  gradient: null,
  observation: {
    id: snapshotId,
    game: "eu5",
    campaignId: "campaign",
    contentHash: snapshotId,
    date: "1360-01-01",
    dateSort: 13600000 + 101 + snapshotIds.indexOf(snapshotId) * 10000,
    gameVersion: "1.0",
    artifacts: ["observations", "map"],
    layoutKey: "layout",
    world: { locationCount: 1, countryCount: 1, totalPopulation: 1 },
  },
});

const opened = () => mocks.step.mock.calls.map(([input]) => (input as { file: File }).file.name);

afterEach(() => vi.unstubAllGlobals());

beforeEach(async () => {
  cancelPreview();
  vi.clearAllMocks();
  vi.stubGlobal("window", { location: { href: "http://localhost/" } });
  campaignTransitions.failed();
  mocks.registry = createLocalSaveRegistry(async () => {
    throw Error("Identity is already known");
  });
  const entries = await mocks.registry.register(
    "eu5",
    files.map((file) => ({ kind: "file", file })),
  );
  entries.forEach((entry, index) =>
    mocks.registry!.recordIdentity(
      entry.id,
      {
        playthroughId: toPlaythroughId("campaign"),
        campaignIdHint: null,
        date: { year: 1360 + index, month: 1, day: 1 },
      },
      files[index],
    ),
  );
  state = {
    input: { kind: "file", file: files[3] },
    saveInput: { kind: "file", file: files[3] },
    playthroughId: "campaign",
    appState: { currentMapMode: "control", mapViewport: null },
    engine,
    insightPanelOpen: false,
    insightPanelWidth: 640,
    setInsightPanelOpen: vi.fn(),
  };
  mocks.present.mockImplementation(async (snapshotId) => reply(snapshotId));
  mocks.step.mockImplementation(async (input) => {
    if (input.kind !== "file") throw Error("Expected a local save");
    state = { ...state, input, saveInput: input };
  });
  useHistory.setState({
    sources: Object.fromEntries(
      entries.map((entry, index) => [
        entry.id,
        { snapshotId: snapshotIds[index], version: files[index] },
      ]),
    ),
  });
});

function navigation() {
  renderToStaticMarkup(<Eu5CampaignProvider>{null}</Eu5CampaignProvider>);
  return mocks.receive.mock.calls.at(-1)![0]!;
}

const preview = (snapshotId: string) => previewSnapshot(engine, "campaign", snapshotId, "control");
const lastToken = (mock: { mock: { calls: unknown[][] } }) => mock.mock.calls.at(-1)!.at(-1);

it("opens the save at the playhead and then shows that save", async () => {
  preview("a");
  await vi.waitFor(() =>
    expect(usePreviewSession.getState()).toMatchObject({ shown: { snapshotId: "a" } }),
  );
  expect(mocks.gate).toHaveBeenCalledExactlyOnceWith(expect.any(Function));

  await openPreview(navigation());

  expect(opened()).toEqual(["a.eu5"]);
  expect(usePreviewSession.getState().kind).toBe("live");
  expect(mocks.clear).toHaveBeenCalledOnce();
  expect(lastToken(mocks.clear)).toBeGreaterThan(lastToken(mocks.present) as number);
  expect(mocks.gate).toHaveBeenLastCalledWith(null);
});

it("opens only the newest target and keeps it on the map while an older save loads", async () => {
  const nav = navigation();
  const loading = Promise.withResolvers<void>();
  mocks.step.mockImplementationOnce(async (input) => {
    await loading.promise;
    if (input.kind === "file") state = { ...state, input, saveInput: input };
  });

  preview("a");
  const first = openPreview(nav);
  await vi.waitFor(() => expect(mocks.step).toHaveBeenCalledOnce());
  preview("b");
  const second = openPreview(nav);
  preview("c");
  const third = openPreview(nav);

  loading.resolve();
  await Promise.all([first, second, third]);

  // A loaded under the overlay, but the overlay stayed on C until C was ready.
  expect(opened()).toEqual(["a.eu5", "c.eu5"]);
  expect(mocks.present.mock.calls.map(([snapshotId]) => snapshotId)).toEqual(["a", "b", "c"]);
  expect(mocks.clear).toHaveBeenCalledOnce();
  expect(mocks.clear.mock.invocationCallOrder[0]).toBeGreaterThan(
    mocks.step.mock.invocationCallOrder[1],
  );
  expect(usePreviewSession.getState().kind).toBe("live");
});

it("keeps the overlay and reports the error when the save does not load", async () => {
  mocks.step.mockRejectedValueOnce(new Error("Could not parse save"));
  preview("a");
  await openPreview(navigation());
  expect(usePreviewSession.getState()).toMatchObject({
    kind: "preview",
    snapshotId: "a",
    error: expect.stringContaining("Could not open this save"),
  });
  expect(mocks.clear).not.toHaveBeenCalled();
  expect(state.input.file).toBe(files[3]);
});

it("opens the previewed save at once on a click and carries the click", async () => {
  bindPreviewNavigation(navigation());
  preview("b");
  const onClick = mocks.gate.mock.calls[0][0]!;
  const click = { kind: "update" as const, locationIdx: 42, modifiers: 0 };
  onClick(click);
  await vi.waitFor(() => expect(usePreviewSession.getState().kind).toBe("live"));
  expect(opened()).toEqual(["b.eu5"]);
  expect(campaignTransitions.takeView("eu5", toPlaythroughId("campaign"))).toMatchObject({
    inspection: { click },
    insightPanel: { open: true },
  });
  expect(state.setInsightPanelOpen).toHaveBeenCalledExactlyOnceWith(true);
});

it("ignores a late reply after the preview ends, and a reply older than the shown frame", async () => {
  const late = Promise.withResolvers<OverlayReply>();
  mocks.present.mockReturnValueOnce(late.promise);
  preview("a");
  cancelPreview();
  late.resolve(reply("a"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(usePreviewSession.getState()).toEqual({ kind: "live" });

  const old = Promise.withResolvers<OverlayReply>();
  mocks.present.mockReturnValueOnce(old.promise);
  preview("a");
  preview("b");
  await vi.waitFor(() =>
    expect(usePreviewSession.getState()).toMatchObject({ shown: { snapshotId: "b" } }),
  );
  old.resolve(reply("a"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(usePreviewSession.getState()).toMatchObject({
    snapshotId: "b",
    shown: { snapshotId: "b" },
  });
});

it("ends the preview when the user opens another save", async () => {
  const nav = navigation();
  preview("a");
  expect(await nav.open(nav.previous!)).toEqual({ kind: "navigated" });
  expect(usePreviewSession.getState().kind).toBe("live");
  expect(mocks.clear).toHaveBeenCalledOnce();
  expect(mocks.clear.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.capture.mock.invocationCallOrder[0],
  );
  expect(opened()).toEqual(["c.eu5"]);
});

it("adds no overlay calls to normal navigation", async () => {
  const nav = navigation();
  expect(await nav.open(nav.previous!)).toEqual({ kind: "navigated" });
  expect(mocks.stop).not.toHaveBeenCalled();
  expect(mocks.clear).not.toHaveBeenCalled();
  expect(mocks.gate).not.toHaveBeenCalled();
});

it("does not open a save when the preview ends while the view is captured", async () => {
  const capture = Promise.withResolvers<Awaited<ReturnType<typeof mocks.capture>>>();
  mocks.capture.mockReturnValueOnce(capture.promise);
  preview("a");
  const opening = openPreview(navigation());
  await vi.waitFor(() => expect(mocks.capture).toHaveBeenCalledOnce());
  cancelPreview();
  capture.resolve({
    mapMode: "control",
    selection: null,
    viewport: null,
    insightPanel: { open: false, width: 640 },
  } as never);
  await opening;
  expect(mocks.step).not.toHaveBeenCalled();
  expect(usePreviewSession.getState().kind).toBe("live");
});

it("does not show the failure of an older frame on a newer one", async () => {
  const old = Promise.withResolvers<OverlayReply>();
  mocks.present.mockReturnValueOnce(old.promise);
  preview("a");
  preview("b");
  await vi.waitFor(() =>
    expect(usePreviewSession.getState()).toMatchObject({ shown: { snapshotId: "b" } }),
  );
  old.reject(new Error("Campaign frame request timed out"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(usePreviewSession.getState()).toMatchObject({ snapshotId: "b", error: null });
});

it("stops playback when the user opens another save or clicks a snapshot", async () => {
  const nav = navigation();
  bindPreviewNavigation(nav);
  setPreviewPlayback("control");
  preview("a");
  mocks.gate.mock.calls[0][0]!({ kind: "clear" });
  expect(usePreviewPlayback.getState().mode).toBeNull();
  await vi.waitFor(() => expect(usePreviewSession.getState().kind).toBe("live"));

  setPreviewPlayback("control");
  expect(await nav.open(nav.previous!)).toEqual({ kind: "navigated" });
  expect(usePreviewPlayback.getState().mode).toBeNull();
});
