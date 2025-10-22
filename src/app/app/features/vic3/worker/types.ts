import type { Remote } from "comlink";

export type * from "@/wasm/wasm_vic3";
export type Vic3WorkerModule = typeof import("./module");
export type Vic3Worker = Remote<Vic3WorkerModule>;
