/// <reference types="vinxi/types/client" />
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/start";
import { createRouter } from "./router";
import { sentryInit } from "./lib/sentry";

const router = createRouter();
sentryInit();

hydrateRoot(document.getElementById("root")!, <StartClient router={router} />);
