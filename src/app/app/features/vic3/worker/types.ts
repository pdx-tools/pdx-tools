import type { Remote } from "comlink";
import type * as Vic3WorkerModuleDefinition from "./module";

export type * from "@/wasm/wasm_vic3";
export type Vic3WorkerModule = typeof Vic3WorkerModuleDefinition;
export type Vic3Worker = Remote<Vic3WorkerModule>;
