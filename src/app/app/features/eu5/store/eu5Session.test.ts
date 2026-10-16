vi.mock("../history/analysisClient", () => ({ connectAnalysisFrames: async () => () => {} }));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveGameInput } from "@/features/engine/engineStore";
import type { Eu5SaveInput } from "./types";
import { initialEu5SessionSnapshot } from "./eu5SessionState";
import type { Eu5SessionSnapshot } from "./eu5SessionState";
import { findEu5Session, getEu5Session, stepEu5Session, terminateEu5Session } from "./eu5Session";
import { terminateCurrentAnalysis } from "@/features/engine/analysisLifecycle";
import { campaignTransitions } from "@/features/campaign/transitions";
import { toPlaythroughId } from "@/features/campaign/types";
import { useHistory } from "../history/store";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  load: vi.fn(),
  terminate: vi.fn(),
  read: vi.fn(),
  open: vi.fn(),
  supported: vi.fn(() => true),
  emit: vi.fn(),
  applyCarry: vi.fn(),
  project: vi.fn(),
}));

vi.mock("@/lib/canvas_courier", () => ({
  CanvasCourierHost: class {
    constructor(
      _className: string,
      private start: (surface: unknown, transport: unknown) => void,
    ) {}
    attach() {
      this.start(
        { offscreen: {} },
        {
          currentSize: () => ({ width: 1, height: 1, scaleFactor: 1 }),
          inputConfig: {},
        },
      );
    }
    renew() {
      this.attach();
    }
    dispose() {}
  },
}));
vi.mock("@/lib/captureException", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/compatibility", () => ({ isWebGPUSupported: mocks.supported }));
vi.mock("@/lib/events", () => ({ emitEvent: mocks.emit }));
vi.mock("../campaignCarry", () => ({ applyEu5Carry: mocks.applyCarry }));
vi.mock("../game-adapter", () => ({
  Eu5GameAdapter: {
    create: () => ({
      start: mocks.start,
      load: mocks.load,
      terminate: mocks.terminate,
      mapStarted: true,
    }),
  },
}));
vi.mock("../ui-engine", () => ({ readSaveData: mocks.read, openEngine: mocks.open }));

const save = (saveId: string): Eu5SaveInput => ({
  kind: "server",
  saveId,
  name: `${saveId}.eu5`,
  uploaderId: null,
});
/** The engine input of the home page for a save. */
const home = (data: Eu5SaveInput): SaveGameInput => ({ kind: "eu5", data });
const game = (input: Eu5SaveInput, show = vi.fn(async () => {})) => ({
  input,
  show,
  release: vi.fn(),
});

function shownInput(session: { getSnapshot: () => Eu5SessionSnapshot }) {
  const snapshot = session.getSnapshot();
  return snapshot.status === "success" ? snapshot.data.getState().input : null;
}

async function openSession(input = save("previous")) {
  const session = getEu5Session(input);
  session.claim(input);
  session.host.attach({} as HTMLElement);
  await vi.waitFor(() => expect(session.getSnapshot().status).toBe("success"));
  return session;
}

beforeEach(() => {
  vi.resetAllMocks();
  campaignTransitions.failed();
  useHistory.setState({
    viewedProfiles: [],
    remapRevision: 0,
    selectedObservations: {},
    settlingObservation: null,
  });
  mocks.supported.mockReturnValue(true);
  mocks.read.mockImplementation(async (input: Eu5SaveInput) => ({
    save: input.kind === "handle" ? { kind: "file", file: await input.file.getFile() } : input,
    data: new Blob(),
  }));
  mocks.start.mockImplementation(async ({ save }: { save: Promise<{ save: Eu5SaveInput }> }) =>
    game((await save).save),
  );
  mocks.load.mockImplementation(async ({ save }: { save: Eu5SaveInput }) => game(save));
  mocks.open.mockImplementation(async () => ({
    engine: {
      trigger: {
        selectMapMode: vi.fn(),
        connectMapFrames: vi.fn(),
        showMapProjection: mocks.project,
      },
      destroy: vi.fn(),
      getState: () => ({ ownerBordersEnabled: true, hoverDisplayData: null }),
      subscribe: () => () => {},
    },
    saveDate: { year: 1400, month: 1, day: 1 },
    playthroughId: "campaign",
    playthroughName: "Campaign",
    multiplayer: false,
    players: [],
    world: {},
  }));
});
afterEach(() => terminateEu5Session());

describe("EU5 campaign transitions", () => {
  const previousProfiles = [{ kind: "country", country: { key: 4, name: "France" } }] as const;
  const nextProfiles = [{ kind: "country", country: { key: 17, name: "France" } }] as const;
  function preserveView() {
    const transition = campaignTransitions.begin("next")!;
    transition.preserveView(toPlaythroughId("campaign")!, {
      game: "eu5",
      payload: {
        mapMode: "political",
        viewport: null,
        selection: null,
        insightPanel: { open: true, width: 400 },
      },
    });
    return transition;
  }

  it("clears breadcrumbs when the target belongs to another campaign", async () => {
    await openSession();
    useHistory.getState().setViewedProfiles([...previousProfiles]);
    const transition = preserveView();
    mocks.open.mockResolvedValueOnce({
      ...(await mocks.open()),
      playthroughId: "another-campaign",
    });
    await stepEu5Session(save("other"));
    expect(mocks.applyCarry).not.toHaveBeenCalled();
    expect(useHistory.getState().viewedProfiles).toEqual([]);
    expect(useHistory.getState().remapRevision).toBe(2);
    transition.complete();
  });

  it("remaps breadcrumbs only after the matching target is successfully displayed", async () => {
    await openSession();
    useHistory.getState().setViewedProfiles([...previousProfiles]);
    const transition = preserveView();
    mocks.applyCarry.mockResolvedValue([...nextProfiles]);
    const displayed = Promise.withResolvers<void>();
    mocks.load.mockResolvedValueOnce(
      game(
        save("next"),
        vi.fn(() => displayed.promise),
      ),
    );
    const step = stepEu5Session(save("next"));
    await vi.waitFor(() => expect(mocks.applyCarry).toHaveBeenCalledOnce());
    expect(useHistory.getState().viewedProfiles).toEqual(previousProfiles);
    displayed.resolve();
    await step;
    expect(useHistory.getState().viewedProfiles).toEqual(nextProfiles);
    transition.complete();
  });

  it("passes a carried map inspection to the destination save", async () => {
    await openSession();
    const interaction = {
      kind: "click" as const,
      event: { kind: "update" as const, locationIdx: 42, modifiers: 1 },
    };
    const transition = campaignTransitions.begin("local-save")!;
    transition.preserveView(toPlaythroughId("campaign")!, {
      game: "eu5",
      payload: {
        mapMode: "markets",
        viewport: null,
        selection: null,
        insightPanel: { open: true, width: 640 },
        inspection: { interaction },
      },
    });
    mocks.applyCarry.mockResolvedValueOnce([]);

    await stepEu5Session(save("local-save"));

    expect(mocks.applyCarry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ inspection: { interaction } }),
    );
    expect(shownInput(findEu5Session(save("local-save"))!)).toEqual(save("local-save"));
    transition.complete();
  });

  it("does not apply target breadcrumbs to the previous save after display fails", async () => {
    const session = await openSession();
    useHistory.getState().setViewedProfiles([...previousProfiles]);
    const transition = preserveView();
    mocks.applyCarry.mockResolvedValue([...nextProfiles]);
    const failure = new Error("Map synchronization failed");
    mocks.load.mockResolvedValueOnce(game(save("next"), vi.fn().mockRejectedValue(failure)));
    await expect(stepEu5Session(save("next"))).rejects.toThrow(failure);
    expect(shownInput(session)).toEqual(save("previous"));
    expect(useHistory.getState().viewedProfiles).toEqual(previousProfiles);
    transition.cancel();
  });

  it("starts with the same snapshot as a page without a session", () => {
    expect(getEu5Session(save("initial")).getSnapshot()).toBe(initialEu5SessionSnapshot);
  });
  it("waits for the save to be shown before the page goes to it", async () => {
    const session = await openSession();
    const display = Promise.withResolvers<void>();
    const target = save("next");
    mocks.load.mockResolvedValueOnce(
      game(
        target,
        vi.fn(() => display.promise),
      ),
    );
    const complete = vi.fn();
    const step = stepEu5Session(target).then(complete);
    await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
    expect(complete).not.toHaveBeenCalled();
    // The page of the open save keeps the session while the step loads.
    expect(findEu5Session(save("previous"))).toBe(session);
    display.resolve();
    await step;

    expect(shownInput(session)).toEqual(target);
    terminateCurrentAnalysis({ from: home(save("previous")), to: home(target) });
    expect(getEu5Session(target)).toBe(session);
    expect(mocks.terminate).not.toHaveBeenCalled();

    // Once the page of the next save claims the session, it is only for that save.
    session.claim(target);
    expect(findEu5Session(save("previous"))).toBeNull();
    expect(findEu5Session(target)).toBe(session);
  });

  it("ends after a step when the page goes to no save", async () => {
    await openSession();
    await stepEu5Session(save("next"));
    terminateCurrentAnalysis({ from: home(save("next")), to: null });
    expect(mocks.terminate).toHaveBeenCalledOnce();
  });

  it("continues on its own route when the home page leaves no save", async () => {
    // The root resets the home save on each route other than the home
    // page. The effect of that reset runs after the effect of the page
    // that made the session.
    const session = await openSession(save("upload"));
    terminateCurrentAnalysis({ from: null, to: null });
    expect(findEu5Session(save("upload"))).toBe(session);
    expect(mocks.terminate).not.toHaveBeenCalled();
  });

  it("continues when the home page leaves a save of another session", async () => {
    const session = await openSession(save("upload"));
    terminateCurrentAnalysis({ from: home(save("local")), to: null });
    expect(findEu5Session(save("upload"))).toBe(session);
    expect(mocks.terminate).not.toHaveBeenCalled();
  });

  it("ends when the home page goes to another save", async () => {
    await openSession(save("local"));
    terminateCurrentAnalysis({ from: home(save("local")), to: home(save("other")) });
    expect(findEu5Session(save("local"))).toBeNull();
    expect(mocks.terminate).toHaveBeenCalledOnce();
  });

  it("restores the previous session before rejecting a failed step", async () => {
    const previous = save("previous");
    const session = await openSession(previous);
    const failure = new Error("The save cannot be parsed");
    const recovery = Promise.withResolvers<ReturnType<typeof game>>();
    mocks.load.mockRejectedValueOnce(failure).mockReturnValueOnce(recovery.promise);
    mocks.emit.mockClear();
    const rejected = vi.fn();
    const step = stepEu5Session(save("failed")).catch(rejected);
    await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    expect(rejected).not.toHaveBeenCalled();
    recovery.resolve(game(previous));
    await step;

    expect(rejected).toHaveBeenCalledWith(failure);
    // The reload of the open save is not a new parse.
    expect(mocks.emit).not.toHaveBeenCalled();
    expect(findEu5Session(save("failed"))).toBeNull();
    expect(shownInput(session)).toEqual(previous);
    expect(getEu5Session(previous)).toBe(session);
  });

  it("waits for a replacement map when the target uses another patch", async () => {
    const session = await openSession();
    const replacement = Promise.withResolvers<ReturnType<typeof game>>();
    const target = save("another-patch");
    mocks.load.mockResolvedValueOnce(null);
    mocks.start.mockReturnValueOnce(replacement.promise);
    const complete = vi.fn();
    const step = stepEu5Session(target).then(complete);
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(2));
    expect(complete).not.toHaveBeenCalled();
    replacement.resolve(game(target));
    await step;
    expect(shownInput(session)).toEqual(target);
  });

  it("restores the previous save on a new map if the replacement map fails", async () => {
    const previous = save("previous");
    const session = await openSession(previous);
    const failure = new Error("The device was lost");
    const recovery = Promise.withResolvers<ReturnType<typeof game>>();
    mocks.load.mockResolvedValueOnce(null);
    mocks.start.mockRejectedValueOnce(failure).mockReturnValueOnce(recovery.promise);
    mocks.emit.mockClear();
    const rejected = vi.fn();
    const step = stepEu5Session(save("another-patch")).catch(rejected);
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(3));
    expect(rejected).not.toHaveBeenCalled();
    recovery.resolve(game(previous));
    await step;

    expect(rejected).toHaveBeenCalledWith(failure);
    expect(mocks.emit).not.toHaveBeenCalled();
    expect(shownInput(session)).toEqual(previous);
    expect(findEu5Session(save("another-patch"))).toBeNull();
  });

  it("rejects a pending step when the analysis ends", async () => {
    await openSession();
    const loading = Promise.withResolvers<ReturnType<typeof game>>();
    mocks.load.mockReturnValueOnce(loading.promise);
    const step = stepEu5Session(save("next"));
    const rejection = expect(step).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
    terminateEu5Session();
    await rejection;
    loading.resolve(game(save("next")));
  });
});

it("does not display a settled save after the requested observation changes during parsing", async () => {
  const session = await openSession();
  const gate = Promise.withResolvers<ReturnType<typeof game>>();
  const stale = game(save("stale"));
  mocks.load.mockReturnValueOnce(gate.promise);
  useHistory.setState({
    selectedObservations: { campaign: "stale" },
    settlingObservation: { campaignId: "campaign", hash: "stale" },
  });
  const step = stepEu5Session(save("stale"));
  const rejected = expect(step).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
  useHistory.setState({
    selectedObservations: { campaign: "latest" },
    snapshots: [
      {
        hash: "latest",
        layoutKey: "layout",
        world: { locationCount: 1, countryCount: 1, totalPopulation: 1 },
      } as never,
    ],
  });
  gate.resolve(stale);
  await rejected;
  expect(mocks.project).toHaveBeenCalledWith(expect.objectContaining({ hash: "latest" }));
  expect(mocks.project.mock.invocationCallOrder[0]).toBeLessThan(
    stale.show.mock.invocationCallOrder[0],
  );
  useHistory.setState({ settlingObservation: { campaignId: "campaign", hash: "latest" } });
  await stepEu5Session(save("latest"));
  expect(shownInput(session)).toEqual(save("latest"));
});
