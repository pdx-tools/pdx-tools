import { expose, Remote } from "comlink";
import * as Eu4Mod from "./module";

expose(Eu4Mod);
export type Eu4WorkerModule = typeof Eu4Mod;
export type Eu4Worker = Remote<Eu4WorkerModule>;
