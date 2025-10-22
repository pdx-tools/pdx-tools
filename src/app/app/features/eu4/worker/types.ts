import type { Remote } from "comlink";
import type * as Eu4WorkerModuleDefinition from "./module";

export type Eu4WorkerModule = typeof Eu4WorkerModuleDefinition;
export type Eu4Worker = Remote<Eu4WorkerModule>;
