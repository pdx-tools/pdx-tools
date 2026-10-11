import { expect, it } from "vitest";
import { parsedSaveKey, rememberSaveFile } from "./saveCacheKey";
it("keeps same-named files from different sources separate", () => {
  const a = new File(["save"], "autosave.eu5", { lastModified: 100 });
  const b = new File(["save"], "autosave.eu5", { lastModified: 100 });
  expect(parsedSaveKey({ kind: "file", file: a })).not.toBe(
    parsedSaveKey({ kind: "file", file: b }),
  );
});
it("reuses an unchanged handle and invalidates an overwritten save", () => {
  const handle = {
    kind: "handle" as const,
    file: {} as FileSystemFileHandle,
    name: "autosave.eu5",
  };
  const files = [100, 100, 200].map(
    (lastModified) => new File(["save"], "autosave.eu5", { lastModified }),
  );
  files.forEach((file) => rememberSaveFile(file, handle));
  const keys = files.map((file) => parsedSaveKey({ kind: "file", file }));
  expect(keys[0]).toBe(keys[1]);
  expect(keys[2]).not.toBe(keys[0]);
});
it("retains the handle identity when its resolved file is reused", () => {
  const file = new File(["save"], "autosave.eu5", { lastModified: 100 });
  rememberSaveFile(file, { kind: "handle", file: {} as FileSystemFileHandle, name: file.name });
  const key = parsedSaveKey({ kind: "file", file });
  rememberSaveFile(file, { kind: "file", file });
  expect(parsedSaveKey({ kind: "file", file })).toBe(key);
});
