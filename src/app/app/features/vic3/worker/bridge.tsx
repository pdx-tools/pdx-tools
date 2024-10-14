import { expose, Remote } from "comlink";
import * as Vic3Mod from "./module";

expose(Vic3Mod);
export type Vic3WorkerModule = typeof Vic3Mod;
export type Vic3Worker = Remote<Vic3WorkerModule>;
