import type { Remote } from "comlink";

export interface ImperatorMetadata {
  date: string;
  version: string;
  isMeltable: boolean;
}

export type ImperatorWorkerModule = typeof import("./module");
export type ImperatorWorker = Remote<ImperatorWorkerModule>;
