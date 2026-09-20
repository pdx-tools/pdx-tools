import { wrap } from "comlink";
import { trackWorker } from "@/lib/sentryWorker";
import type { Ck3WorkerModule } from "./types";
export { type Ck3Worker } from "./types";

function createWorker() {
  const rawWorker = new Worker(new URL("./bridge", import.meta.url), {
    type: "module",
  });
  trackWorker(rawWorker);
  return wrap<Ck3WorkerModule>(rawWorker);
}

let worker: undefined | ReturnType<typeof createWorker>;
export function getCk3Worker() {
  return (worker ??= createWorker());
}
