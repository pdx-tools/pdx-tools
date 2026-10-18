import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type * as Zustand from "zustand";
import type { CampaignNav } from "@/features/campaign/useCampaignNav";
import type { CampaignAdapter } from "@/features/campaign/useCampaignNav";
import type { OpenSave } from "@/features/campaign/types";
import type { Eu5SaveInput } from "./store/types";
import type { LocalSaveRegistry } from "@/features/campaign/localSaves";
import type * as LocalSaves from "@/features/campaign/localSaves";

const mocks = vi.hoisted(() => ({
  registry: null as LocalSaveRegistry | null,
  receive: vi.fn<(nav: CampaignNav | null) => void>(),
  step: vi.fn<(input: Eu5SaveInput) => Promise<void>>(),
  stop: vi.fn(async () => {}),
  clear: vi.fn(async () => {}),
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
vi.mock("./store", () => ({
  useEu5Context: () => store,
  activeEu5Store: () => store,
  useEu5Input: () => state.input,
  useEu5SaveInput: () => state.saveInput,
  useEu5Multiplayer: () => false,
  useEu5PlaythroughId: () => "campaign",
  useEu5SaveDate: () => ({ year: 1362, month: 1, day: 1 }),
  useSaveFilename: () => state.input.file.name,
  stepEu5Session: mocks.step,
}));
import { createLocalSaveRegistry } from "@/features/campaign/localSaves";
import { toPlaythroughId } from "@/features/campaign/types";
import { campaignTransitions } from "@/features/campaign/transitions";
import { useCampaignNav } from "@/features/campaign/useCampaignNav";
import { useHistory } from "./history/store";
import { ensureObservationLoaded } from "./history/observationLoader";
import { Eu5CampaignProvider } from "./campaign";

const files = ["preview", "previous", "current"].map(
  (name, index) => new File([name], `${name}.eu5`, { lastModified: index + 1 }),
);
let state: {
  input: { kind: "file"; file: File };
  saveInput: { kind: "file"; file: File };
  playthroughId: string;
  appState: {
    currentMapMode: "control";
    mapProjection: { hash: string } | undefined;
    mapViewport: null;
  };
  engine: {
    trigger: { stopMapProjection: typeof mocks.stop; clearMapProjection: typeof mocks.clear };
  };
  insightPanelOpen: boolean;
  insightPanelWidth: number;
};
const store = { getState: () => state };

afterEach(() => vi.unstubAllGlobals());

beforeEach(async () => {
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
    input: { kind: "file", file: files[2] },
    saveInput: { kind: "file", file: files[2] },
    playthroughId: "campaign",
    appState: { currentMapMode: "control", mapProjection: { hash: "preview" }, mapViewport: null },
    engine: { trigger: { stopMapProjection: mocks.stop, clearMapProjection: mocks.clear } },
    insightPanelOpen: false,
    insightPanelWidth: 640,
  };
  mocks.stop.mockResolvedValue();
  mocks.clear.mockImplementation(async () => {
    state.appState.mapProjection = undefined;
  });
  mocks.step.mockImplementation(async (input) => {
    if (input.kind !== "file") throw Error("Expected a local save");
    state.input = input;
    state.saveInput = input;
    state.appState.mapProjection = undefined;
  });
  useHistory.setState({
    selectedObservations: { campaign: "preview" },
    settlingObservation: null,
    previewCarries: {},
    sources: Object.fromEntries(
      entries.map((entry, index) => [
        entry.id,
        {
          hash: ["preview", "previous", "current"][index],
          version: files[index],
        },
      ]),
    ),
  });
});

function navigation() {
  renderToStaticMarkup(<Eu5CampaignProvider>{null}</Eu5CampaignProvider>);
  return mocks.receive.mock.calls.at(-1)![0]!;
}

it("cancels released-playhead settling when the previous-save shortcut starts navigation", async () => {
  const nav = navigation();
  expect(nav.previous?.name).toBe("previous.eu5");
  const worker = Promise.withResolvers<void>();
  mocks.stop.mockReturnValueOnce(worker.promise);
  const settlement = ensureObservationLoaded("campaign", "preview", nav).then(
    () => ({ kind: "loaded" }),
    (error) => ({ kind: "error", error }),
  );
  await vi.waitFor(() => expect(mocks.stop).toHaveBeenCalledOnce());
  // This is the same nav.open path used by the `[` shortcut.
  const step = nav.open(nav.previous!);
  await new Promise((resolve) => setTimeout(resolve, 0));
  worker.resolve();
  const [settled, navigated] = await Promise.all([settlement, step]);
  expect(navigated).toEqual({ kind: "navigated" });
  expect(settled).toMatchObject({ kind: "error", error: { name: "AbortError" } });
  expect(state.input.file).toBe(files[1]);
  expect(useHistory.getState().selectedObservations.campaign).toBeUndefined();
  expect(useHistory.getState().settlingObservation).toBeNull();
  expect(state.appState.mapProjection).toBeUndefined();
  expect(mocks.step).toHaveBeenCalledTimes(1);
});

it("discards an idle analytical selection before normal save navigation", async () => {
  const nav = navigation();
  expect(await nav.open(nav.previous!)).toEqual({ kind: "navigated" });
  expect(useHistory.getState().selectedObservations.campaign).toBeUndefined();
  expect(mocks.clear).toHaveBeenCalledOnce();
  expect(mocks.clear.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.capture.mock.invocationCallOrder[0],
  );
});

it("allows automatic settling to use campaign navigation without cancelling itself", async () => {
  await ensureObservationLoaded("campaign", "preview", navigation());
  expect(state.input.file).toBe(files[0]);
  expect(useHistory.getState().selectedObservations.campaign).toBe("preview");
  expect(mocks.step).toHaveBeenCalledTimes(1);
});

it("leaves the retained full save usable when manual navigation fails", async () => {
  mocks.step.mockRejectedValueOnce(new Error("Could not parse save"));
  const nav = navigation();
  expect(await nav.open(nav.previous!)).toMatchObject({
    kind: "failed",
    failure: { kind: "load" },
  });
  expect(state.input.file).toBe(files[2]);
  expect(state.appState.mapProjection).toBeUndefined();
  expect(useHistory.getState().selectedObservations.campaign).toBeUndefined();
});

it("adds no projection RPCs to normal navigation without analytical playback", async () => {
  useHistory.setState({ selectedObservations: {} });
  state.appState.mapProjection = undefined;
  const nav = navigation();
  expect(await nav.open(nav.previous!)).toEqual({ kind: "navigated" });
  expect(mocks.stop).not.toHaveBeenCalled();
  expect(mocks.clear).not.toHaveBeenCalled();
});
