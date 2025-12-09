import { wrap } from "comlink";
import type { ImperatorWorkerModule } from "./types";
export { type ImperatorWorker } from "./types";

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
