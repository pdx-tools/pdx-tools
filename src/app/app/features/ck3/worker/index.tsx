import { wrap } from "comlink";
import type { Ck3WorkerModule } from "./types";
export { type Ck3Worker } from "./types";

function createWorker() {
  const rawWorker = new Worker(new URL("./bridge", import.meta.url), {
    type: "module",
  });
  return wrap<Ck3WorkerModule>(rawWorker);
}

let worker: undefined | ReturnType<typeof createWorker>;
export function getCk3Worker() {
  return (worker ??= createWorker());
}
