import { expect, it } from "vitest";
import { sha256File } from "@/lib/sha256";
import { createWasmGame, OVERWRITTEN } from "./wasm";

const createGame = () =>
  createWasmGame(
    {
      default: async () => {},
      melt: (data: Uint8Array) => data,
      set_tokens: () => {},
    },
    "test.wasm",
    "tokens.bin",
  );

it("does not read other bytes than the parsed ones after the file changes on disk", async () => {
  const game = createGame();
  let diskFile = new File(["parsed save"], "autosave.eu4");
  const handle = { getFile: async () => diskFile } as unknown as FileSystemFileHandle;
  const hash = await sha256File(diskFile);
  game.stash(new Uint8Array(), { kind: "handle", file: handle }, hash);
  expect(new TextDecoder().decode(await game.viewData())).toBe("parsed save");

  const copy = diskFile;
  diskFile = new File(["newer save"], "autosave.eu4");
  await expect(game.viewData()).rejects.toThrow(OVERWRITTEN);

  game.restash({ kind: "file", file: copy }, hash);
  expect(new TextDecoder().decode(await game.viewData())).toBe("parsed save");
});
