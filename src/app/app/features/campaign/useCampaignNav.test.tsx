import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCampaignNav } from "./useCampaignNav";
import type { CampaignAdapter, CampaignNav } from "./useCampaignNav";
import { registerLocalSaves, setCampaignOpening } from "./localSaves";
import { toPlaythroughId } from "./types";
import type { CampaignSave, OpenSave } from "./types";
import { dropCampaignCarry } from "./carry";
import { openCampaignSave } from "./openSave";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  fileInput: vi.fn(),
  capture: vi.fn(),
  toastError: vi.fn(),
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
const captureCarry: CampaignAdapter["captureCarry"] = () => ({
  game: "eu5",
  payload: {
    mapMode: "political",
    viewport: null,
    selection: null,
    insightPanel: { open: false, width: 640 },
  },
});

const beforeNavigation = (prepare: NonNullable<CampaignAdapter["prepare"]>): CampaignAdapter => ({
  completion: "before-navigation",
  captureCarry,
  prepare,
});

function renderNav(adapter: CampaignAdapter): CampaignNav {
  const receive = vi.fn<(nav: CampaignNav | null) => void>();
  function Page() {
    receive(useCampaignNav(open, adapter, null));
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
  setCampaignOpening(null);
});
afterEach(() => {
  setCampaignOpening(null);
  dropCampaignCarry();
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

  it("keeps the page input until a local save is ready", async () => {
    const file = new File(["save"], "next.eu5");
    const [entry] = await registerLocalSaves("eu5", [{ kind: "file", file }]);
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
});
