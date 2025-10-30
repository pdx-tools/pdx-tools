import { wrap } from "comlink";
import type { Eu4Worker, Eu4WorkerModule } from "./types";

function createWorker(): Eu4Worker {
  const rawWorker = new Worker(new URL("./bridge", import.meta.url), {
    type: "module",
  });
  return wrap<Eu4WorkerModule>(rawWorker);
}

let worker: undefined | Eu4Worker;
export function getEu4Worker() {
  return (worker ??= createWorker());
}
