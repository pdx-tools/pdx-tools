import { check } from "@/lib/isPresent";
import { wrap } from "comlink";
import { type Ck3WorkerModule } from "./bridge";
export { type Ck3Worker } from "./bridge";

function createWorker() {
  if (typeof window === "undefined") {
    return undefined;
  }

  const rawWorker = new Worker(new URL("./bridge", import.meta.url));
  return wrap<Ck3WorkerModule>(rawWorker);
}

const worker = createWorker();

export function getCk3Worker() {
  return check(worker, "ck3 worker should be defined");
}
