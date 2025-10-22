import type { Remote } from "comlink";
import type * as ImperatorWorkerModuleDefinition from "./module";

export interface ImperatorMetadata {
  date: string;
  version: string;
  isMeltable: boolean;
}

export type ImperatorWorkerModule = typeof ImperatorWorkerModuleDefinition;
export type ImperatorWorker = Remote<ImperatorWorkerModule>;
