import type { Eu5ParsedSave, Eu5SaveInput } from "./store/types";
const sources = new WeakMap<object, string>();
const files = new WeakMap<File, string>();
let nextId = 0;
/** Scope a handle's cached parse to both its identity and the version actually read. */
export function rememberSaveFile(file: File, input: Eu5SaveInput): void {
  if (input.kind === "server" || (input.kind === "file" && files.has(file))) return;
  let id = sources.get(input.file);
  if (!id) {
    id = `local:${++nextId}`;
    sources.set(input.file, id);
  }
  files.set(file, `${id}:${file.size}:${file.lastModified}`);
}
export function parsedSaveKey(save: Eu5ParsedSave): string {
  if (save.kind === "server") return `upload:${save.saveId}`;
  if (!files.has(save.file)) rememberSaveFile(save.file, save);
  return files.get(save.file)!;
}
