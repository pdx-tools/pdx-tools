import { check } from "@/lib/isPresent";
import { wrap } from "comlink";
import { type ImperatorWorkerModule } from "./bridge";
export { type ImperatorWorker } from "./bridge";

function createWorker() {
  if (typeof window === "undefined") {
    return undefined;
  }

  const rawWorker = new Worker(new URL("./bridge", import.meta.url));
  return wrap<ImperatorWorkerModule>(rawWorker);
}

const worker = createWorker();

export function getImperatorWorker() {
  return check(worker, "imperator worker should be defined");
}
