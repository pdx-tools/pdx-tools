import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { LocalSaveRef } from "@/features/campaign/types";
import type { FileKind } from "@/hooks/useFileDrop";

const mocks = vi.hoisted(() => ({
  receive: vi.fn(),
  input: vi.fn(),
  register: vi.fn(),
}));
vi.mock("../engineStore", async (original) => ({
  ...(await original()),
  useEngineActions: () => ({ fileInput: mocks.input }),
}));
vi.mock("@/features/campaign/localSaves", () => ({
  registerLocalSaves: mocks.register,
  localSaveInput: (game: string, ref: LocalSaveRef) => ({ kind: game, data: ref }),
}));
import { useFilePublisher } from "./useFilePublisher";
function Publisher({ openSave = true }: { openSave?: boolean }) {
  mocks.receive(useFilePublisher({ openSave }));
  return null;
}
function publish(...args: Parameters<ReturnType<typeof useFilePublisher>>) {
  const callback = mocks.receive.mock.lastCall![0] as ReturnType<typeof useFilePublisher>;
  return callback(...args);
}
beforeEach(() => {
  mocks.input.mockReset();
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
    renderToStaticMarkup(<Publisher openSave={false} />);
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
it.each(["eu4", "eu5"])(
  "opens a newly dropped %s save even when another save is open",
  async (game) => {
    const first = input(`first.${game}`, 1);
    const next = input(`next.${game}`, 2);
    await publish(first);
    await publish(next);
    expect(mocks.input).toHaveBeenCalledTimes(2);
    expect(mocks.input).toHaveBeenLastCalledWith({ kind: game, data: next });
  },
);
it("preserves explicit add-only intent across asynchronous registration", async () => {
  renderToStaticMarkup(<Publisher openSave={false} />);
  await Promise.all([publish(input("first.eu5", 1)), publish(input("second.eu5", 2))]);
  expect(mocks.register).toHaveBeenCalledTimes(2);
  expect(mocks.input).not.toHaveBeenCalled();
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
