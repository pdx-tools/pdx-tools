import { wrap } from "comlink";
import { trackWorker } from "@/lib/sentryWorker";
import type { ImperatorWorkerModule } from "./types";
export { type ImperatorWorker } from "./types";

function createWorker() {
  const rawWorker = new Worker(new URL("./bridge", import.meta.url), {
    type: "module",
  });
  trackWorker(rawWorker);
  return wrap<ImperatorWorkerModule>(rawWorker);
}

let worker: undefined | ReturnType<typeof createWorker>;
export function getImperatorWorker() {
  return (worker ??= createWorker());
}
