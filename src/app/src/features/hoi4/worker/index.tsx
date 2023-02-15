import { check } from "@/lib/isPresent";
import { wrap } from "comlink";
import { Hoi4WorkerModule } from "./bridge";

function createWorker() {
  if (typeof window === "undefined") {
    return undefined;
  }

  const rawWorker = new Worker(new URL("./bridge", import.meta.url));
  return wrap<Hoi4WorkerModule>(rawWorker);
}

const worker = createWorker();

export function getHoi4Worker() {
  return check(worker, "hoi4 worker should be defined");
}
