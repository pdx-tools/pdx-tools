import type { LocalSaveRef } from "@/features/campaign/types";

export type Eu5SaveInput =
  | LocalSaveRef
  | {
      kind: "server";
      saveId: string;
      name: string;
      /** The user who uploaded the save, for the campaign it is part of. */
      uploaderId: string | null;
    };

/**
 * A save as it was parsed. A file handle is read once into a `File` before
 * the parse. The `File` is a snapshot, so a later read (such as an upload)
 * gets the same bytes, or fails if the game overwrote the file.
 */
export type Eu5ParsedSave = Exclude<Eu5SaveInput, { kind: "handle" }>;

/** A save and its bytes, read in full before the save that is open goes. */
export type Eu5SaveData = { save: Eu5ParsedSave; data: ArrayBuffer };

export function eu5SaveFileUrl(saveId: string): string {
  return `/api/eu5/saves/${saveId}/file`;
}

/** A parsed save that the player opened from disk, so it can be uploaded. */
export type Eu5LocalSave = Extract<Eu5ParsedSave, { kind: "file" }>;

/** Whether two inputs are the same save: the same upload, file, or file handle. */
export function sameEu5Save(a: Eu5SaveInput, b: Eu5SaveInput): boolean {
  switch (a.kind) {
    case "server":
      return b.kind === "server" && a.saveId === b.saveId;
    case "file":
      return b.kind === "file" && a.file === b.file;
    case "handle":
      return b.kind === "handle" && a.file === b.file;
  }
}
