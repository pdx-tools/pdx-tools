import { fetchOk } from "@/lib/fetch";
import { check } from "@/lib/isPresent";
import { transfer } from "comlink";

type Allocated = {
  free(): void;
};

type Wasm<P> = {
  default(path: P): Promise<any>;
  melt(data: Uint8Array): Uint8Array;
  set_tokens(tokens: Uint8Array): void;
};

type StashOp =
  | {
      kind: "local";
      file: File;
    }
  | { kind: "remote"; url: string };

export function createWasmGame<
  WasmModule extends Wasm<P>,
  SaveFile extends Allocated,
  P
>(mod: WasmModule, wasmPath: P, tokenPath: string) {
  let _save: SaveFile | undefined;
  let bytes = new Uint8Array();
  let initTask: Promise<void> | undefined = undefined;
  let initialized = false;
  let stashed: StashOp | undefined;

  let loadModule = async () => {
    const [tokenData] = await Promise.all([
      fetchOk(tokenPath).then((x) => x.arrayBuffer()),
      mod.default(wasmPath),
    ]);
    mod.set_tokens(new Uint8Array(tokenData));
    initialized = true;
  };

  let initializeModule = () => (initTask = initTask ?? loadModule());

  return new (class {
    get module() {
      check(initialized, "wasm module not yet initialized");
      return mod;
    }

    initializeModule = initializeModule;

    get save(): SaveFile {
      return check(_save, "save is undefined");
    }

    set save(newSave: SaveFile) {
      _save?.free();
      _save = newSave;
    }

    async viewData() {
      switch (stashed?.kind) {
        case undefined:
          throw new Error("expected raw data to exist");
        case "local":
          return stashed.file.arrayBuffer().then((x) => new Uint8Array(x));
        case "remote":
          return fetchOk(stashed.url, { cache: "force-cache" })
            .then((x) => x.arrayBuffer())
            .then((x) => new Uint8Array(x));
      }
    }

    async melt() {
      const data = await this.viewData();
      const melt = this.module.melt(data);
      return transfer(melt, [melt.buffer]);
    }

    stash(data: Uint8Array, stashOp: StashOp) {
      bytes = data;
      stashed = stashOp;
    }

    viewStash() {
      return bytes;
    }

    takeStash() {
      const result = bytes;
      if (result.length === 0) {
        throw new Error("stash is empty");
      }
      bytes = new Uint8Array();
      return result;
    }
  })();
}
