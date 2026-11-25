import { fetchOk } from "@/lib/fetch";
import { check } from "@/lib/isPresent";
import { transfer } from "comlink";
import { sha256 } from "@/lib/sha256";

type Allocated = {
  free(): void;
};

type Wasm<P> = {
  default(path: { module_or_path: P }): Promise<unknown>;
  melt(data: Uint8Array): Uint8Array;
  set_tokens(tokens: Uint8Array): void;
};

type StashOp =
  | {
      kind: "file";
      file: File;
    }
  | {
      kind: "handle";
      file: FileSystemFileHandle;
    }
  | { kind: "remote"; url: string };

/** Bytes that are read again must be the bytes that were parsed. */
export const OVERWRITTEN =
  "The game has written over this file, so the save on screen cannot be read again.";

export function createWasmGame<WasmModule extends Wasm<P>, SaveFile extends Allocated, P>(
  mod: WasmModule,
  wasmPath: P,
  tokenPath: string,
) {
  let _save: SaveFile | undefined;
  let bytes = new Uint8Array();
  let initTask: Promise<void> | undefined = undefined;
  let initialized = false;
  let stashed: StashOp | undefined;
  let stashedHash: string | null = null;

  const loadModule = async () => {
    const [tokenData] = await Promise.all([
      fetchOk(tokenPath).then((x) => x.arrayBuffer()),
      mod.default({ module_or_path: wasmPath }),
    ]);
    mod.set_tokens(new Uint8Array(tokenData));
    initialized = true;
  };

  const initializeModule = () => (initTask = initTask ?? loadModule());

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
      const expected = stashedHash;
      const data = await this.readStashed();
      if (expected !== null && (await sha256(data)) !== expected) throw new Error(OVERWRITTEN);
      return data;
    }

    private async readStashed() {
      switch (stashed?.kind) {
        case undefined:
          throw new Error("expected raw data to exist");
        case "file":
          return stashed.file.arrayBuffer().then((x) => new Uint8Array(x));
        case "handle":
          return stashed.file
            .getFile()
            .then((x) => x.arrayBuffer())
            .then((x) => new Uint8Array(x));
        case "remote":
          return fetchOk(stashed.url, { cache: "force-cache" })
            .then((x) => x.arrayBuffer())
            .then((x) => new Uint8Array(x));
      }
    }

    async melt(): Promise<Uint8Array<ArrayBuffer>> {
      const data = await this.viewData();

      // we know that wasm-bindgen does not return shared array buffers.
      const melt = this.module.melt(data) as Uint8Array<ArrayBuffer>;
      return transfer(melt, [melt.buffer]);
    }

    /** A hash binds later reads to these bytes. */
    stash(data: Uint8Array<ArrayBuffer>, stashOp: StashOp, hash: string | null = null) {
      bytes = data;
      this.restash(stashOp, hash);
    }

    /** Read the save from another source from now on. */
    restash(stashOp: StashOp, hash: string | null) {
      stashed = stashOp;
      stashedHash = hash;
    }

    get hash() {
      return stashedHash;
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
