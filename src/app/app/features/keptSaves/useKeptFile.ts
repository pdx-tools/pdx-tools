import { useKept } from "./keptStore";
import { fileState } from "./text";
import type { FileState } from "./text";

/** Where the file of a kept save is now. Null for a save without a copy. */
export function useKeptFile(hash: string | null): FileState | null {
  return useKept((state) => {
    const save = state.index.saves.get(hash ?? "");
    return save === undefined ? null : fileState(save, state);
  });
}
