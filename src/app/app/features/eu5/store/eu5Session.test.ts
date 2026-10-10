import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Eu5SaveInput } from "./types";
import { initialEu5SessionSnapshot } from "./eu5SessionState";
import { findEu5Session, getEu5Session, stepEu5Session, terminateEu5Session } from "./eu5Session";
import { terminateCurrentAnalysis } from "@/features/engine/analysisLifecycle";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  load: vi.fn(),
  terminate: vi.fn(),
  read: vi.fn(),
  open: vi.fn(),
  supported: vi.fn(() => true),
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
vi.mock("@/lib/events", () => ({ emitEvent: vi.fn() }));
vi.mock("../campaignCarry", () => ({ applyEu5Carry: vi.fn() }));
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
const game = (input: Eu5SaveInput, show = vi.fn(async () => {})) => ({
  input,
  show,
  release: vi.fn(),
});

async function openSession(input = save("previous")) {
  const session = getEu5Session(input);
  session.claim(input);
  session.host.attach({} as HTMLElement);
  await vi.waitFor(() => expect(session.getSnapshot().data).not.toBeNull());
  return session;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.supported.mockReturnValue(true);
  mocks.read.mockImplementation(async (input: Eu5SaveInput) => ({
    save: input.kind === "handle" ? { kind: "file", file: await input.file.getFile() } : input,
    data: new ArrayBuffer(0),
  }));
  mocks.start.mockImplementation(async ({ save }: { save: Promise<{ save: Eu5SaveInput }> }) =>
    game((await save).save),
  );
  mocks.load.mockImplementation(async ({ save }: { save: Eu5SaveInput }) => game(save));
  mocks.open.mockImplementation(async () => ({
    engine: {
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

    expect(session.getSnapshot().data?.getState().input).toEqual(target);
    terminateCurrentAnalysis({ kind: "eu5", data: target });
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
    terminateCurrentAnalysis(null);
    expect(mocks.terminate).toHaveBeenCalledOnce();
  });

  it("restores the previous session before rejecting a failed step", async () => {
    const previous = save("previous");
    const session = await openSession(previous);
    const failure = new Error("The save cannot be parsed");
    const recovery = Promise.withResolvers<ReturnType<typeof game>>();
    mocks.load.mockRejectedValueOnce(failure).mockReturnValueOnce(recovery.promise);
    const rejected = vi.fn();
    const step = stepEu5Session(save("failed")).catch(rejected);
    await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    expect(rejected).not.toHaveBeenCalled();
    recovery.resolve(game(previous));
    await step;

    expect(rejected).toHaveBeenCalledWith(failure);
    expect(findEu5Session(save("failed"))).toBeNull();
    expect(session.getSnapshot().data?.getState().input).toEqual(previous);
    expect(getEu5Session(previous)).toBe(session);
    expect(session.getSnapshot().error).toBeNull();
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
    expect(session.getSnapshot().data?.getState().input).toEqual(target);
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
