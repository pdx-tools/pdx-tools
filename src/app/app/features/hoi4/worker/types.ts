import type { Remote } from "comlink";

export type { Hoi4Metadata } from "@/wasm/wasm_hoi4";
export type Hoi4WorkerModule = typeof import("./module");
export type Hoi4Worker = Remote<Hoi4WorkerModule>;
