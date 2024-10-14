import { Remote } from "comlink";

export type Eu4WorkerModule = typeof import("./module");
export type Eu4Worker = Remote<Eu4WorkerModule>;
