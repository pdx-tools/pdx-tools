import { EnhancedMeta } from "@/features/eu4/types/models";
import { SaveFile } from "../../../../../../wasm-eu4/pkg/wasm_eu4";

let savefile: SaveFile | undefined = undefined;
let meta: EnhancedMeta | undefined = undefined;

export function loadedSave() {
  if (savefile === undefined) {
    throw new Error("savefile should not undefined");
  } else {
    return savefile;
  }
}

export function eu4SetSaveFile(aSavefile: SaveFile) {
  savefile?.free();
  savefile = aSavefile;
}

export function eu4SetMeta(aMeta: EnhancedMeta) {
  meta = aMeta;
}

export function eu4GetMeta() {
  return meta;
}
