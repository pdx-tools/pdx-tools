import { SaveFile } from "../../../../../../wasm-imperator/pkg/wasm_imperator";
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
