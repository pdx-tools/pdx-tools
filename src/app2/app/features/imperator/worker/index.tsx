import { wrap } from "comlink";
import { type ImperatorWorkerModule } from "./bridge";
export { type ImperatorWorker } from "./bridge";

function createWorker() {
  const rawWorker = new Worker(new URL("./bridge", import.meta.url), {
    type: "module",
  });
  return wrap<ImperatorWorkerModule>(rawWorker);
}

let worker: undefined | ReturnType<typeof createWorker>;
export function getImperatorWorker() {
  return (worker ??= createWorker());
}
