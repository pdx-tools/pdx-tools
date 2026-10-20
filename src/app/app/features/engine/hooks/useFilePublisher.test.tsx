import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type * as Engine from "../engineStore";
import type { LocalSaveRef } from "@/features/campaign/types";
import type { FileKind } from "@/hooks/useFileDrop";

const mocks = vi.hoisted(() => ({
  loaded: false,
  receive: vi.fn(),
  input: vi.fn(),
  register: vi.fn(),
}));
vi.mock("../engineStore", async (original) => {
  const actual = await original<typeof Engine>();
  return {
    ...actual,
    isSaveLoaded: () => mocks.loaded || actual.isSaveLoaded(),
    useEngineActions: () => ({ fileInput: mocks.input }),
  };
});
vi.mock("@/features/campaign/localSaves", () => ({
  registerLocalSaves: mocks.register,
  localSaveInput: (game: string, ref: LocalSaveRef) => ({ kind: game, data: ref }),
}));
import { useFilePublisher } from "./useFilePublisher";
import { isSaveLoaded, registerCampaignViewer } from "../engineStore";
function Publisher() {
  mocks.receive(useFilePublisher());
  return null;
}
function publish(...args: Parameters<ReturnType<typeof useFilePublisher>>) {
  const callback = mocks.receive.mock.lastCall![0] as ReturnType<typeof useFilePublisher>;
  return callback(...args);
}
beforeEach(() => {
  mocks.loaded = false;
  mocks.input.mockReset().mockImplementation(() => {
    mocks.loaded = true;
  });
  mocks.register
    .mockReset()
    .mockImplementation(async (_game: unknown, refs: LocalSaveRef[]) =>
      refs.map((ref) => ({ ref })),
    );
  renderToStaticMarkup(<Publisher />);
});
const input = (name: string, lastModified: number): FileKind => ({
  kind: "file",
  file: new File(["save"], name, { lastModified }),
});
it.each(["eu4", "eu5"])(
  "registers all %s files and opens the newest when nothing is loaded",
  async (game) => {
    const older = input(`old.${game}`, 1),
      newer = input(`new.${game}`, 2);
    await publish([older, newer]);
    expect(mocks.register).toHaveBeenCalledWith(game, [older, newer]);
    expect(mocks.input).toHaveBeenCalledExactlyOnceWith({ kind: game, data: newer });
  },
);
it.each(["eu4", "eu5"])(
  "registers added %s saves without replacing the current save",
  async (game) => {
    mocks.loaded = true;
    const file = input(`new.${game}`, 2);
    await publish(file);
    expect(mocks.register).toHaveBeenCalledWith(game, [file]);
    expect(mocks.input).not.toHaveBeenCalled();
  },
);
it("preserves handles and continues when another handle is unreadable", async () => {
  const file = new File(["save"], "save.EU5", { lastModified: 2 });
  const good = {
    kind: "handle",
    file: { name: file.name, getFile: vi.fn(async () => file) },
  } as unknown as FileKind;
  const bad = {
    kind: "handle",
    file: {
      name: "bad.eu5",
      getFile: vi.fn(async () => {
        throw Error("Unreadable");
      }),
    },
  } as unknown as FileKind;
  await publish([good, bad]);
  expect(mocks.register).toHaveBeenCalledWith("eu5", [
    { kind: "handle", file: good.file, name: file.name },
  ]);
  expect(mocks.input).toHaveBeenCalledWith({
    kind: "eu5",
    data: { kind: "handle", file: good.file, name: file.name },
  });
});
it("checks the active save after asynchronous registration", async () => {
  mocks.register.mockImplementation(async (_game: unknown, refs: LocalSaveRef[]) => {
    mocks.loaded = true;
    return refs.map((ref) => ({ ref }));
  });
  await publish(input("save.eu5", 1));
  expect(mocks.input).not.toHaveBeenCalled();
});
it("does not open another campaign save when two selections arrive together", async () => {
  await Promise.all([publish(input("first.eu5", 1)), publish(input("second.eu5", 2))]);
  expect(mocks.register).toHaveBeenCalledTimes(2);
  expect(mocks.input).toHaveBeenCalledOnce();
});
it("reports an entirely unreadable selection without changing the active save", async () => {
  await expect(
    publish({
      kind: "handle",
      file: {
        getFile: async () => {
          throw Error("Unreadable");
        },
      },
    } as unknown as FileKind),
  ).rejects.toThrow("Unreadable");
  expect(mocks.input).not.toHaveBeenCalled();
});

it("retains an uploaded-save viewer with no home-page input", async () => {
  const unregister = registerCampaignViewer();
  try {
    expect(isSaveLoaded()).toBe(true);
    await publish(input("new.eu5", 1));
    expect(mocks.register).toHaveBeenCalledOnce();
    expect(mocks.input).not.toHaveBeenCalled();
  } finally {
    unregister();
  }
});
it("keeps the current viewer registered when an older viewer unmounts", () => {
  const first = registerCampaignViewer(),
    second = registerCampaignViewer();
  first();
  expect(isSaveLoaded()).toBe(true);
  second();
  expect(isSaveLoaded()).toBe(false);
});
