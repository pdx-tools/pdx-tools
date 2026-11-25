import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveGameInput } from "@/features/engine/engineStore";
import type { Eu5SaveInput } from "./types";
import { initialEu5SessionSnapshot } from "./eu5SessionState";
import type { Eu5SessionSnapshot } from "./eu5SessionState";
import {
  findEu5Session,
  getEu5Session,
  rebindEu5Session,
  stepEu5Session,
  terminateEu5Session,
} from "./eu5Session";
import { terminateCurrentAnalysis } from "@/features/engine/analysisLifecycle";
import { campaignTransitions } from "@/features/campaign/transitions";
import { toPlaythroughId } from "@/features/campaign/types";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  load: vi.fn(),
  terminate: vi.fn(),
  read: vi.fn(),
  open: vi.fn(),
  supported: vi.fn(() => true),
  emit: vi.fn(),
  applyCarry: vi.fn(),
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
  it("passes a carried map click to the destination save", async () => {
    await openSession();
    const click = { kind: "update" as const, locationIdx: 42, modifiers: 1 };
    const transition = campaignTransitions.begin("local-save")!;
    transition.preserveView(toPlaythroughId("campaign")!, {
      game: "eu5",
      payload: {
        mapMode: "markets",
        viewport: null,
        selection: null,
        insightPanel: { open: true, width: 640 },
        inspection: { click },
      },
    });
    mocks.applyCarry.mockResolvedValueOnce([]);

    await stepEu5Session(save("local-save"));

    expect(mocks.applyCarry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ inspection: { click } }),
    );
    expect(shownInput(findEu5Session(save("local-save"))!)).toEqual(save("local-save"));
    transition.complete();
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

  const local = (text: string) =>
    ({ kind: "file", file: new File([text], `${text}.eu5`) }) satisfies Eu5SaveInput;

  it("goes back to the copied bytes when the player cancels, without an error", async () => {
    const previous = local("previous");
    const session = await openSession(previous);
    const loading = Promise.withResolvers<ReturnType<typeof game>>();
    mocks.load.mockReturnValueOnce(loading.promise);
    const controller = new AbortController();
    const step = stepEu5Session(local("next"), { signal: controller.signal });
    const rejection = expect(step).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
    // The game writes over the file, and the player goes back.
    vi.spyOn(previous.file, "arrayBuffer").mockRejectedValue(
      new DOMException("The file changed", "NotReadableError"),
    );
    const next = game(local("next"));
    controller.abort(new DOMException("Back", "AbortError"));
    loading.resolve(next);
    await rejection;

    expect(next.release).toHaveBeenCalledOnce();
    expect(shownInput(session)).toBe(previous);
    const { save: reloaded } = mocks.load.mock.lastCall![0];
    expect(await reloaded.file.text()).toBe("previous");
    await stepEu5Session(local("other"));
  });

  it("does not release a save that it could not restore for a follow", async () => {
    const previous = local("previous");
    const session = await openSession(previous);
    vi.spyOn(previous.file, "arrayBuffer").mockRejectedValue(
      new DOMException("The file changed", "NotReadableError"),
    );
    await expect(stepEu5Session(local("next"), { isWanted: () => true })).rejects.toThrow(
      "changed",
    );
    expect(mocks.load).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({ status: "success", stepping: false });
    // A player can still choose the save.
    await stepEu5Session(local("next"));
    expect(mocks.load).toHaveBeenCalledOnce();
  });

  it.each(["before the read", "carry", "show"])("goes back when cancelled at %s", async (at) => {
    const previous = local("previous");
    const session = await openSession(previous);
    const controller = new AbortController();
    const abort = () => controller.abort(new DOMException("Back", "AbortError"));
    const next = local("next");
    if (at === "before the read") abort();
    const transition = campaignTransitions.begin("next")!;
    if (at === "carry") {
      transition.preserveView(toPlaythroughId("campaign")!, {
        game: "eu5",
        payload: {
          mapMode: "markets",
          viewport: null,
          selection: null,
          insightPanel: { open: false, width: 640 },
        },
      });
      mocks.applyCarry.mockImplementationOnce(async () => abort());
    }
    if (at === "show")
      mocks.load.mockResolvedValueOnce(
        game(
          next,
          vi.fn(async () => abort()),
        ),
      );
    const step = stepEu5Session(next, { signal: controller.signal });
    await expect(step).rejects.toMatchObject({ name: "AbortError" });
    transition.cancel();
    expect(shownInput(session)).toBe(previous);
    expect(session.getSnapshot()).toMatchObject({ status: "success", stepping: false });
  });

  it("does not open a follow that is not wanted after the read", async () => {
    const session = await openSession(local("previous"));
    const step = stepEu5Session(local("next"), { isWanted: () => false });
    await expect(step).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.load).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({ stepping: false });
  });

  it("points every holder at the copy, and not while a step loads", async () => {
    const previous = local("previous");
    const session = await openSession(previous);
    const copy = local("copy");
    expect(rebindEu5Session(local("other"), copy, copy)).toBe(false);
    expect(rebindEu5Session(previous, copy, copy)).toBe(true);
    expect(shownInput(session)).toBe(copy);
    expect(findEu5Session(copy)).toBe(session);
    expect(findEu5Session(previous)).toBeNull();

    const loading = Promise.withResolvers<ReturnType<typeof game>>();
    mocks.load.mockReturnValueOnce(loading.promise);
    const next = local("next");
    const step = stepEu5Session(next);
    await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
    expect(rebindEu5Session(copy, previous, previous)).toBe(false);
    loading.resolve(game(next));
    await step;
  });
});
