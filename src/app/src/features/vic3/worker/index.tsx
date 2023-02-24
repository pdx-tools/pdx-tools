import { check } from "@/lib/isPresent";
import { wrap } from "comlink";
import { type Vic3WorkerModule } from "./bridge";
export { type Vic3Worker } from "./bridge";

function createWorker() {
  if (typeof window === "undefined") {
    return undefined;
  }

  const rawWorker = new Worker(new URL("./bridge", import.meta.url));
  return wrap<Vic3WorkerModule>(rawWorker);
}

const worker = createWorker();

export function getVic3Worker() {
  return check(worker, "vic3 worker should be defined");
}
