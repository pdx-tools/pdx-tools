import type { Remote } from "comlink";
import type * as Hoi4WorkerModuleDefinition from "./module";

export type { Hoi4Metadata } from "@/wasm/wasm_hoi4";
export type Hoi4WorkerModule = typeof Hoi4WorkerModuleDefinition;
export type Hoi4Worker = Remote<Hoi4WorkerModule>;
