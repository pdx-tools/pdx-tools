import { SaveFile } from "../../../../../../wasm-ck3/pkg/wasm_ck3";
let savefile: SaveFile | undefined = undefined;

export function loadedSave() {
  if (savefile === undefined) {
    throw new Error("savefile should not undefined");
  } else {
    return savefile;
  }
}

export function setSaveFile(aSavefile: SaveFile) {
  savefile?.free();
  savefile = aSavefile;
}
