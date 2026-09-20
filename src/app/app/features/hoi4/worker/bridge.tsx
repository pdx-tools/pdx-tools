import { expose } from "comlink";
import { registerWebWorker } from "@sentry/react-router";
import * as Hoi4Mod from "./module";

registerWebWorker({ self });
expose(Hoi4Mod);
