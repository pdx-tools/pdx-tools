import { expose } from "comlink";
import { registerWebWorker } from "@sentry/react-router";
import * as Eu4Mod from "./module";

registerWebWorker({ self });
expose(Eu4Mod);
