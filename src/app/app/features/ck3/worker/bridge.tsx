import { expose, Remote } from "comlink";
import * as Ck3Mod from "./module";

expose(Ck3Mod);
export type Ck3WorkerModule = typeof Ck3Mod;
export type Ck3Worker = Remote<Ck3WorkerModule>;
