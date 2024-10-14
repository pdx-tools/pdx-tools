import { expose, Remote } from "comlink";
import * as Hoi4Mod from "./module";

expose(Hoi4Mod);
export type Hoi4WorkerModule = typeof Hoi4Mod;
export type Hoi4Worker = Remote<Hoi4WorkerModule>;
