import { expose } from "comlink";
import { registerWebWorker } from "@sentry/react-router";
import init, { check_save } from "@/wasm/wasm_compress";
import wasmPath from "@/wasm/wasm_compress_bg.wasm?url";
import { createCapture } from "./capture";
import type { CaptureEvents, WatchedRoot } from "./capture";
import { keptEnv } from "./env";
import { sweepOrphans } from "./store";

registerWebWorker({ self });

/** Group the records that one write of the game causes. */
const DEBOUNCE_MS = 250;
/** Find the writes that the browser did not report. */
const RESCAN_MS = 60_000;
/** Without reports, read the folder this often. */
const POLL_MS = 5_000;

async function check(data: Uint8Array) {
  await init({ module_or_path: wasmPath });
  return check_save(data);
}

let capture: ReturnType<typeof createCapture> | null = null;
let observer: FileSystemObserver | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let observed = false;

async function observe(handle: WatchedRoot["handle"]): Promise<void> {
  observer?.disconnect();
  observer = new FileSystemObserver((records) => {
    capture?.request(DEBOUNCE_MS);
    // An error ends the observation.
    if (records.some((record) => record.type === "errored")) observed = false;
  });
  try {
    await observer.observe(handle, { recursive: true });
    observed = true;
  } catch {
    observed = false;
  }
}

const api = {
  async start(root: WatchedRoot, events: CaptureEvents): Promise<void> {
    await sweepOrphans(keptEnv);
    capture = createCapture(root, keptEnv, check, events);
    await observe(root.handle);
    let last = Date.now();
    timer = setInterval(() => {
      if (observed && Date.now() - last < RESCAN_MS) return;
      last = Date.now();
      if (!observed) void observe(root.handle);
      capture?.request();
    }, POLL_MS);
    capture.request();
  },
  scan: () => capture?.request(),
  retry: () => capture?.retry(),
  async stop(): Promise<void> {
    clearInterval(timer);
    observer?.disconnect();
    await capture?.stop();
  },
};

export type CaptureWorker = typeof api;

expose(api);
