import { wrap } from "comlink";
import { type Eu4WorkerModule } from "./bridge";
export { useEu4Worker } from "./useEu4Worker";
export { useAnalysisWorker } from "./useAnalysisWorker";
export { type Eu4Worker } from "./bridge";
export { type FileObservationFrequency } from "./init";

function createWorker() {
  const rawWorker = new Worker(new URL("./bridge", import.meta.url), {
    type: "module",
  });
  return wrap<Eu4WorkerModule>(rawWorker);
}

let worker: undefined | ReturnType<typeof createWorker>;
export function getEu4Worker() {
  return (worker ??= createWorker());
}
