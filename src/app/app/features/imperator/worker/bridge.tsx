import { expose } from "comlink";
import { registerWebWorker } from "@sentry/react-router";
import * as ImperatorMod from "./module";

registerWebWorker({ self });
expose(ImperatorMod);
