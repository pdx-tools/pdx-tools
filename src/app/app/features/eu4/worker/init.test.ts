import { beforeEach, expect, it, vi } from "vitest";
import { createWasmGame } from "@/lib/wasm";

const mocks = vi.hoisted(() => ({ reparse: vi.fn(), version: { first: 1, second: 37 } }));
vi.mock("./timeline", () => ({ resetTimelineCursor: vi.fn() }));
vi.mock("@/lib/fetch", () => ({
  fetchOk: async () => ({ arrayBuffer: async () => new ArrayBuffer(0) }),
}));
vi.mock("./common", async () => {
  const wasm = createWasmGame(
    {
      default: async () => {},
      melt: (data: Uint8Array) => new Uint8Array(data),
      set_tokens: () => {},
      parse_meta: () => ({ savegame_version: mocks.version }),
    },
    "test.wasm",
    "tokens.bin",
  );
  return { wasm };
});
import { wasm } from "./common";
import { fetchData, getRawData, melt, rebind, reparse } from "./init";

const text = (data: Uint8Array) => new TextDecoder().decode(data);
const file = (content: string, name = "ironman.eu4") =>
  ({ kind: "file", file: new File([content], name) }) as const;
const hashOf = async (ref: ReturnType<typeof file>) => {
  const { sha256File } = await import("@/lib/sha256");
  return sha256File(ref.file);
};

/** The game file that the player opens, which the game writes over. */
function gameFile(content: string) {
  const state = { content };
  const handle = { getFile: async () => new File([state.content], "ironman.eu4") };
  const ref = {
    kind: "handle",
    name: "ironman.eu4",
    file: handle as unknown as FileSystemFileHandle,
  } as const;
  return { ref, state };
}

beforeEach(async () => {
  vi.stubGlobal("isSecureContext", true);
  mocks.reparse.mockReset();
  await wasm.initializeModule();
  const save = {
    free: () => {},
    reparse: mocks.reparse,
    get_meta_raw: () => ({ savegame_version: { first: 1, second: 37 }, player: "ITA" }),
    get_starting_country: () => undefined,
    get_achievements: () => ({}),
    save_info: () => ({ playthroughId: "campaign", mode: "Singleplayer" }),
    get_start_date: () => "",
    get_total_days: () => 0,
    localize_country: () => "Italy",
    get_players: () => [],
    get_alive_countries: () => [],
    savefile_warnings: () => [],
  };
  wasm.save = save as unknown as typeof wasm.save;
});

it("gives the bytes of the displayed save only, to an upload and to a melt", async () => {
  const shown = await fetchData(file("A"));
  expect(text(await getRawData(shown))).toBe("A");
  expect(text(await melt(shown))).toBe("A");

  // Another save loads, or its load failed, while the first one is on screen.
  await fetchData(file("B"));
  await expect(getRawData(shown)).rejects.toThrow("Another save");
  await expect(melt(shown)).rejects.toThrow("Another save");
});

it("does not melt the next save before the view publishes it", async () => {
  const shown = await fetchData(file("A"));
  const next = file("B");
  const update = await reparse(shown, next, await hashOf(next));
  expect(update.kind).toBe("updated");
  await expect(melt(shown)).rejects.toThrow("Another save");
  if (update.kind === "updated") expect(text(await melt(update))).toBe("B");
});

it("reads the copy after a rebind, when the game wrote over the file", async () => {
  const { ref, state } = gameFile("A");
  const shown = await fetchData(ref);
  const copy = file("A", "copy");
  expect(await rebind(shown, file("other"))).toBe(false);
  expect(await rebind(shown, copy)).toBe(true);
  state.content = "B";
  expect(text(await getRawData(shown))).toBe("A");
});

it("refuses a late rebind and a late update after another open of the same bytes", async () => {
  const first = await fetchData(gameFile("A").ref);
  const second = await fetchData(file("A", "second.eu4"));
  expect(await rebind(first, file("A", "copy"))).toBe(false);
  expect((await reparse(first, file("B"), await hashOf(file("B")))).kind).toBe("stale");
  expect(mocks.reparse).not.toHaveBeenCalled();
  expect(await rebind(second, file("A", "copy"))).toBe(true);
});

it("keeps the open save when the next one cannot be parsed", async () => {
  const shown = await fetchData(file("A"));
  mocks.reparse.mockImplementationOnce(() => {
    throw new Error("The save cannot be parsed");
  });
  const next = file("B");
  await expect(reparse(shown, next, await hashOf(next))).rejects.toThrow("parsed");
  expect(text(await getRawData(shown))).toBe("A");
});

it("does not parse a save of other game data over the open one", async () => {
  const shown = await fetchData(file("A"));
  mocks.version.second = 36;
  const next = file("B");
  expect((await reparse(shown, next, await hashOf(next))).kind).toBe("other-version");
  mocks.version.second = 37;
  expect(mocks.reparse).not.toHaveBeenCalled();
});

it("keeps the newest load when an earlier one ends its read later", async () => {
  const slow = Promise.withResolvers<void>();
  const handle = {
    getFile: async () => {
      await slow.promise;
      return new File(["first"], "ironman.eu4");
    },
  } as unknown as FileSystemFileHandle;
  const first = fetchData({ kind: "handle", name: "ironman.eu4", file: handle });
  const shown = await fetchData(file("second"));
  slow.resolve();
  await first.catch(() => {});
  expect(text(wasm.viewStash())).toBe("second");
  expect(text(await getRawData(shown))).toBe("second");
  // A follow and an adoption work on the save that shows.
  expect(await rebind(shown, file("second", "copy"))).toBe(true);
  const next = file("third");
  expect((await reparse(shown, next, await hashOf(next))).kind).toBe("updated");
  await expect(first).rejects.toMatchObject({ name: "AbortError" });
});
