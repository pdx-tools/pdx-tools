import { wrap } from "comlink";
export { useEu4Worker } from "./useEu4Worker";
export { useAnalysisWorker } from "./useAnalysisWorker";
export { type FileObservationFrequency } from "./init";
import { type Eu4Worker, type Eu4WorkerModule } from "./types";
export * from "./types";

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
