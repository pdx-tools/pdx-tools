import { fetchOk } from "@/lib/fetch";
import { check } from "@/lib/isPresent";
import { transfer } from "comlink";
import { timeAsync } from "./timeit";

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
      lastModified: number;
    }
  | { kind: "remote"; url: string };

export function createWasmGame<
  WasmModule extends Wasm<P>,
  SaveFile extends Allocated,
  P,
>(mod: WasmModule, wasmPath: P, tokenPath: string) {
  let _save: SaveFile | undefined;
  let bytes = new Uint8Array();
  let initTask: Promise<void> | undefined = undefined;
  let initialized = false;
  let stashed: StashOp | undefined;

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

    stash(data: Uint8Array<ArrayBuffer>, stashOp: StashOp) {
      bytes = data;
      stashed = stashOp;
    }

    supportsFileObserver() {
      return stashed?.kind === "handle";
    }

    startFileObserver(callback: (data: Uint8Array) => Promise<void> | void) {
      if (stashed?.kind !== "handle") {
        throw new Error("file observer not supported");
      }

      const handle = stashed.file;
      let lastModified = stashed.lastModified;
      let timeoutHandle: ReturnType<typeof setTimeout>;

      function intervalCheck() {
        poll();
        timeoutHandle = setTimeout(() => intervalCheck(), 5000);
      }

      async function poll() {
        const file = await timeAsync("poll file", () => handle.getFile());
        if (file.lastModified <= lastModified) {
          return;
        }

        lastModified = file.lastModified;
        stashed = { kind: "handle", file: handle, lastModified };
        const bytes = await timeAsync("read polled file", () =>
          file.arrayBuffer(),
        );
        await callback(new Uint8Array(bytes));
      }

      intervalCheck();

      return {
        stopObserver() {
          clearTimeout(timeoutHandle);
        },
      };
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
