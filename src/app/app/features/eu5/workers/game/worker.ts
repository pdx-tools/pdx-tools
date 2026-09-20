import { expose } from "comlink";
import { registerWebWorker } from "@sentry/react-router";
import * as module from "./game-module";

registerWebWorker({ self });
expose(module);
