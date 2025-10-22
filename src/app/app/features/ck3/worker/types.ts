import type { Remote } from "comlink";

export interface Ck3Metadata {
  version: string;
  isMeltable: boolean;
}

export type Ck3WorkerModule = typeof import("./module");
export type Ck3Worker = Remote<Ck3WorkerModule>;
