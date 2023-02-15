import { expose, Remote } from "comlink";
import * as ImperatorMod from "./module";

expose(ImperatorMod);
export type ImperatorWorkerModule = typeof ImperatorMod;
export type ImperatorWorker = Remote<ImperatorWorkerModule>;
