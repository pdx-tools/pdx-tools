import { expose } from "comlink";
import { registerWebWorker } from "@sentry/react-router";
import * as Ck3Mod from "./module";

registerWebWorker({ self });
expose(Ck3Mod);
