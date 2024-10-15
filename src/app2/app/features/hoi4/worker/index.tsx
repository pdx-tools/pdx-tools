import { wrap } from "comlink";
import { Hoi4WorkerModule } from "./bridge";

function createWorker() {
  const rawWorker = new Worker(new URL("./bridge", import.meta.url), {
    type: "module",
  });
  return wrap<Hoi4WorkerModule>(rawWorker);
}

let worker: undefined | ReturnType<typeof createWorker>;
export function getHoi4Worker() {
  return (worker ??= createWorker());
}
