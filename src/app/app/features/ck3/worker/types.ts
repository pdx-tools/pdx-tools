import type { Remote } from "comlink";
import type * as Ck3WorkerModuleDefinition from "./module";

export interface Ck3Metadata {
  version: string;
  isMeltable: boolean;
}

export type Ck3WorkerModule = typeof Ck3WorkerModuleDefinition;
export type Ck3Worker = Remote<Ck3WorkerModule>;
