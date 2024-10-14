import { wrap } from "comlink";
import { type Vic3WorkerModule } from "./bridge";
export { type Vic3Worker } from "./bridge";

function createWorker() {
  const rawWorker = new Worker(new URL("./bridge", import.meta.url), { type: "module" });
  return wrap<Vic3WorkerModule>(rawWorker);
}

let worker: undefined | ReturnType<typeof createWorker>;
export function getVic3Worker() {
  return (worker ??= createWorker());
}
