import { afterEach, expect, it, vi } from "vitest";
import { createWasmGame } from "./wasm";

afterEach(() => vi.useRealTimers());

it("reports the watched file snapshot that supplied the bytes even if the disk file changes during the read", async () => {
  vi.useFakeTimers();
  const game = createWasmGame(
    {
      default: async () => {},
      melt: (data: Uint8Array) => data,
      set_tokens: () => {},
    },
    "test.wasm",
    "tokens.bin",
  );
  const snapshot = new File(["watched save"], "autosave.eu4", { lastModified: 2 });
  const bytes = new TextEncoder().encode("watched save");
  const reading = Promise.withResolvers<ArrayBuffer>();
  const read = vi.spyOn(snapshot, "arrayBuffer").mockImplementation(() => reading.promise);
  let diskFile = snapshot;
  const handle = { getFile: async () => diskFile } as unknown as FileSystemFileHandle;
  game.stash(new Uint8Array(), { kind: "handle", file: handle, lastModified: 1 });
  const notification = Promise.withResolvers<{ bytes: Uint8Array; file: File }>();
  const observer = game.startFileObserver((bytes, file) => notification.resolve({ bytes, file }));
  try {
    await vi.waitFor(() => expect(read).toHaveBeenCalled());
    diskFile = new File(["newer save"], "autosave.eu4", { lastModified: 3 });
    reading.resolve(bytes.buffer);
    const result = await notification.promise;
    expect(new TextDecoder().decode(result.bytes)).toBe("watched save");
    expect(result.file.lastModified).toBe(2);
    expect(result.file.size).toBe(bytes.byteLength);
  } finally {
    observer.stopObserver();
  }
});
