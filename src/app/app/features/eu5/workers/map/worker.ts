import { expose } from "comlink";
import { registerWebWorker } from "@sentry/react-router";
import * as module from "./map-module";

registerWebWorker({ self });
expose(module);
