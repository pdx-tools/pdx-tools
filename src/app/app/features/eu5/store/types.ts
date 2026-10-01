export type Eu5SaveInput =
  | { kind: "file"; file: File }
  | { kind: "handle"; file: FileSystemFileHandle; name: string }
  | { kind: "server"; saveId: string; name: string };

/**
 * A save as it was parsed. A file handle is read once into a `File` before
 * the parse. The `File` is a snapshot, so a later read (such as an upload)
 * gets the same bytes, or fails if the game overwrote the file.
 */
export type Eu5ParsedSave = Exclude<Eu5SaveInput, { kind: "handle" }>;

/** A parsed save that the player opened from disk, so it can be uploaded. */
export type Eu5LocalSave = Extract<Eu5ParsedSave, { kind: "file" }>;
