import * as Comlink from "comlink";
import * as mod from "./map-worker";

export type MapWorker = typeof mod;
Comlink.expose(mod);
