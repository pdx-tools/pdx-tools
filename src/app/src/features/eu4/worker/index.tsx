import { check } from "@/lib/isPresent";
import { wrap } from "comlink";
import { type Eu4WorkerModule } from "./bridge";
export { useEu4Worker } from "./useEu4Worker";
export { useAnalysisWorker } from "./useAnalysisWorker";
export { type Eu4Worker } from "./bridge";
export { type FileObservationFrequency } from "./init";

function createWorker() {
  if (typeof window === "undefined") {
    return undefined;
  }

  const rawWorker = new Worker(new URL("./bridge", import.meta.url));
  return wrap<Eu4WorkerModule>(rawWorker);
}

const worker = createWorker();

export function getEu4Worker() {
  return check(worker, "eu4 worker should be defined");
}
