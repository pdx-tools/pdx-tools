import { renderToString } from "react-dom/server";
import type * as Zustand from "zustand";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCampaignNav } from "./useCampaignNav";
import type { CampaignAdapter, CampaignNav } from "./useCampaignNav";
import { createLocalSaveRegistry } from "./localSaves";
import type { LocalSaveRegistry } from "./localSaves";
import { toPlaythroughId } from "./types";
import type { CampaignSave, OpenSave, SaveIdentity } from "./types";
import { createCampaignTransitions } from "./transitions";
import type { CampaignTransitions } from "./transitions";
import type { CampaignCarry } from "./transitions";
import { openCampaignSave } from "./openSave";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  fileInput: vi.fn(),
  capture: vi.fn(),
  toastError: vi.fn(),
  address: vi.fn(),
}));
// Use current store snapshots for controlled renders without a DOM.
vi.mock("zustand", async (importOriginal) => ({
  ...(await importOriginal<typeof Zustand>()),
  useStore: (store: { getState: () => unknown }, select: (state: unknown) => unknown) =>
    select(store.getState()),
}));
vi.mock("react-router", () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => ({ pathname: "/eu5/saves/previous" }),
}));
vi.mock("@/features/account", () => ({ useSession: () => ({ id: null }) }));
vi.mock("@/features/engine", () => ({ useEngineActions: () => ({ fileInput: mocks.fileInput }) }));
vi.mock("@/lib/captureException", () => ({ captureException: mocks.capture }));
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.toastError } }));
vi.mock("@/services/appApi", () => ({
  pdxApi: { saves: { useCampaign: () => ({ data: { saves: [] } }) } },
}));
vi.mock("./reader", () => ({ readSaveIdentity: vi.fn() }));

const open: OpenSave = {
  game: "eu5",
  playthroughId: toPlaythroughId("campaign"),
  campaignIdHint: null,
  multiplayer: false,
  date: { year: 1400, month: 1, day: 1 },
  name: "previous.eu5",
  source: { kind: "upload", saveId: "previous", uploaderId: null },
};
const target: CampaignSave = {
  key: "upload:next",
  date: { year: 1401, month: 1, day: 1 },
  name: "next.eu5",
  isOpen: false,
  membership: "same",
  problem: null,
  source: { kind: "upload", saveId: "next", uploaderId: null, userName: "" },
};
const carry: CampaignCarry = {
  game: "eu5",
  payload: {
    mapMode: "political",
    viewport: null,
    selection: null,
    insightPanel: { open: false, width: 640 },
  },
};
const captureCarry: CampaignAdapter["captureCarry"] = () => carry;

const beforeNavigation = (prepare: NonNullable<CampaignAdapter["prepare"]>): CampaignAdapter => ({
  completion: "before-navigation",
  captureCarry,
  prepare,
});

let registry: LocalSaveRegistry;
let transitions: CampaignTransitions;

function renderNav(
  adapter: CampaignAdapter,
  current: OpenSave = open,
  loadError: unknown = null,
): CampaignNav {
  const receive = vi.fn<(nav: CampaignNav | null) => void>();
  function Page() {
    receive(
      useCampaignNav(current, adapter, loadError, {
        registry,
        transitions,
        address: mocks.address,
      }),
    );
    return null;
  }
  renderToString(<Page />);
  const nav = receive.mock.calls.at(-1)?.[0];
  if (nav == null) throw new Error("The page did not render a campaign");
  return nav;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.navigate.mockResolvedValue(undefined);
  mocks.address.mockReturnValue("/eu5/saves/previous");
  registry = createLocalSaveRegistry(async () => ({
    playthroughId: open.playthroughId,
    campaignIdHint: null,
    date: target.date,
  }));
  transitions = createCampaignTransitions();
});

describe("campaign navigation", () => {
  it.each(["prepare", "navigate", "capture"])(
    "treats an aborted %s as cancellation",
    async (stage) => {
      const error = new DOMException("The session ended", "AbortError");
      const prepare = vi.fn(async () => {});
      const adapter = beforeNavigation(prepare);
      if (stage === "prepare") prepare.mockRejectedValueOnce(error);
      if (stage === "navigate") mocks.navigate.mockRejectedValueOnce(error);
      if (stage === "capture")
        adapter.captureCarry = vi.fn(captureCarry).mockRejectedValueOnce(error);
      const nav = renderNav(adapter);
      expect(await openCampaignSave(nav, target)).toEqual({ kind: "cancelled" });
      expect(mocks.capture).not.toHaveBeenCalled();
      expect(mocks.toastError).not.toHaveBeenCalled();
      expect(await nav.open(target)).toEqual({ kind: "navigated" });
    },
  );

  it("releases the reservation when a step completes before navigation", async () => {
    const nav = renderNav(beforeNavigation(vi.fn(async () => {})));
    expect(await nav.open(target)).toEqual({ kind: "navigated" });
    expect(await nav.open(target)).toEqual({ kind: "navigated" });
  });

  it("keeps the reservation for a game that loads after navigation", async () => {
    const nav = renderNav({ completion: "after-navigation", captureCarry });
    expect(await nav.open(target)).toEqual({ kind: "navigated" });
    expect(await nav.open(target)).toEqual({ kind: "busy" });
  });

  it("reports unexpected navigation errors and releases the reservation", async () => {
    const error = new Error("Unexpected router failure");
    mocks.navigate.mockRejectedValueOnce(error);
    const nav = renderNav({ completion: "after-navigation", captureCarry });
    expect(await nav.open(target)).toEqual({ kind: "failed", failure: { kind: "unavailable" } });
    expect(mocks.capture).toHaveBeenCalledOnce();
    expect(mocks.capture).toHaveBeenCalledWith(error, { tags: { msg: "campaign-open" } });
    expect(await nav.open(target)).toEqual({ kind: "navigated" });
  });

  it("keeps the route and page input when preparation rejects after recovery", async () => {
    const error = new Error("The save cannot be parsed");
    const prepare = vi.fn(async () => {
      throw error;
    });
    const nav = renderNav(beforeNavigation(prepare));
    expect(await openCampaignSave(nav, target)).toEqual({
      kind: "failed",
      failure: { kind: "load", error },
    });
    expect(mocks.toastError).toHaveBeenCalledOnce();
    expect(mocks.toastError).toHaveBeenCalledWith("Could not open the save", {
      description: error.message,
    });
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.fileInput).not.toHaveBeenCalled();
  });

  it("waits for preparation and blocks calls from the same render", async () => {
    const ready = Promise.withResolvers<void>();
    const prepare = vi.fn(() => ready.promise);
    const nav = renderNav(beforeNavigation(prepare));
    const result = nav.open(target);
    expect(await nav.open(target)).toEqual({ kind: "busy" });
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    expect(mocks.navigate).not.toHaveBeenCalled();
    ready.resolve();
    expect(await result).toEqual({ kind: "navigated" });
    expect(mocks.navigate).toHaveBeenCalledWith("/eu5/saves/next", { replace: true });
  });

  it("cancels a step when the user goes to another page during preparation", async () => {
    const ready = Promise.withResolvers<void>();
    const nav = renderNav(beforeNavigation(() => ready.promise));
    const result = nav.open(target);
    mocks.address.mockReturnValue("/saves");
    ready.resolve();
    expect(await result).toEqual({ kind: "cancelled" });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("keeps the page input until a local save is ready", async () => {
    const file = new File(["save"], "next.eu5");
    const [entry] = await registry.register("eu5", [{ kind: "file", file }]);
    const ready = Promise.withResolvers<void>();
    const prepare = vi.fn(() => ready.promise);
    const nav = renderNav(beforeNavigation(prepare));
    const local: CampaignSave = {
      ...target,
      key: `local:${entry.id}`,
      source: { kind: "local", entryId: entry.id, uploadedBy: null },
    };
    const result = nav.open(local);
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    expect(mocks.fileInput).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    ready.resolve();
    expect(await result).toEqual({ kind: "navigated" });
    expect(mocks.fileInput).toHaveBeenCalledWith({ kind: "eu5", data: entry.ref });
    expect(mocks.navigate).toHaveBeenCalledWith("/", { replace: true });
  });

  it("preserves a caller-provided inspection carry when opening a local save", async () => {
    const file = new File(["save"], "next.eu5");
    const [entry] = await registry.register("eu5", [{ kind: "file", file }]);
    const prepare = vi.fn(async () => {});
    const adapter = beforeNavigation(prepare);
    adapter.captureCarry = vi.fn(captureCarry);
    const nav = renderNav(adapter);
    const local: CampaignSave = {
      ...target,
      key: `local:${entry.id}`,
      source: { kind: "local", entryId: entry.id, uploadedBy: null },
    };
    const requestedCarry: CampaignCarry = {
      game: "eu5",
      payload: {
        mapMode: "markets",
        viewport: null,
        selection: null,
        insightPanel: { open: true, width: 640 },
        inspection: {
          interaction: {
            kind: "click",
            event: { kind: "update", locationIdx: 42, modifiers: 1 },
          },
        },
      },
    };

    expect(await nav.open(local, requestedCarry)).toEqual({ kind: "navigated" });
    expect(adapter.captureCarry).not.toHaveBeenCalled();
    expect(transitions.takeView("eu5", open.playthroughId)).toEqual(requestedCarry.payload);
  });

  it("allows another step and starts fresh after a save fails to load", async () => {
    const playthroughId = toPlaythroughId("campaign")!;
    const nav = renderNav({ completion: "after-navigation", captureCarry });
    expect(await nav.open(target)).toEqual({ kind: "navigated" });
    expect(await nav.open(target)).toEqual({ kind: "busy" });
    transitions.failed();
    expect(transitions.takeView("eu5", playthroughId)).toBeNull();
    expect(await nav.open(target)).toEqual({ kind: "navigated" });
  });
});

it("keeps the open local entry after another selection replaces its reference and fails to load", async () => {
  const oldRef = {
    kind: "file" as const,
    file: new File(["save"], "current.eu5", { lastModified: 1 }),
  };
  const [entry] = await registry.register("eu5", [oldRef]);
  const current: OpenSave = {
    ...open,
    name: "current.eu5",
    source: registry.sourceFor("eu5", oldRef),
  };
  registry.observeOpen(current);
  const newRef = {
    kind: "file" as const,
    file: new File(["save"], "current.eu5", { lastModified: 1 }),
  };
  const [, newest] = await registry.register("eu5", [
    newRef,
    { kind: "file", file: new File(["next"], "newest.eu5", { lastModified: 2 }) },
  ]);
  await registry.readIdentity(newest.id);
  const error = new Error("The newest save cannot load");
  const adapter = beforeNavigation(async () => {
    throw error;
  });
  const nav = renderNav(adapter, current);
  const next = nav.saves.find((save) => save.key === `local:${newest.id}`)!;
  expect(await nav.open(next)).toEqual({ kind: "failed", failure: { kind: "load", error } });
  const afterFailure = renderNav(adapter, current, error);
  expect(afterFailure.pending).toBe(0);
  expect(afterFailure.saves.filter((save) => save.isOpen).map((save) => save.key)).toEqual([
    `local:${entry.id}`,
  ]);
  expect(registry.get(entry.id)?.ref.file).toBe(newRef.file);
  expect(mocks.fileInput).not.toHaveBeenCalled();
  expect(mocks.navigate).not.toHaveBeenCalled();
});

it("distinguishes open local saves that have the same file name", async () => {
  registry = createLocalSaveRegistry(async (_, file): Promise<SaveIdentity> => ({
    playthroughId: open.playthroughId,
    campaignIdHint: null,
    date: { year: Number(await file.text()), month: 1, day: 1 },
  }));
  const refs = [
    { kind: "file" as const, file: new File(["1400"], "autosave.eu5", { lastModified: 1 }) },
    { kind: "file" as const, file: new File(["1450"], "autosave.eu5", { lastModified: 2 }) },
  ];
  const entries = await registry.register("eu5", refs);
  await Promise.all(entries.map((entry) => registry.readIdentity(entry.id)));
  const adapter = beforeNavigation(async () => {});
  for (let i = 0; i < entries.length; i++) {
    const current: OpenSave = {
      ...open,
      date: registry.get(entries[i].id)!.identity!.date,
      name: "autosave.eu5",
      source: registry.sourceFor("eu5", refs[i]),
    };
    const nav = renderNav(adapter, current);
    expect(nav.saves[nav.openIndex].key).toBe(`local:${entries[i].id}`);
    expect(nav.saves.filter((save) => save.isOpen)).toHaveLength(1);
  }
});
