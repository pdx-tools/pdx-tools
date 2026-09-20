import { expose } from "comlink";
import { registerWebWorker } from "@sentry/react-router";
import * as Vic3Mod from "./module";

registerWebWorker({ self });
expose(Vic3Mod);
