#!/usr/bin/env node

// Make sure that the dev server ports are available before the dev stack
// starts. If a port is in use, stop with the name of the process that uses it.

import { execFileSync } from "child_process";
import { createServer } from "net";

const ports = {
  app: Number(process.env.PDX_DEV_APP_PORT ?? 3001),
  docs: Number(process.env.PDX_DEV_DOCS_PORT ?? 4321),
  api: Number(process.env.PDX_DEV_API_PORT ?? 8082),
};

// On macOS and Windows, a listener on the wildcard address does not conflict
// with a listener on a loopback address. Thus, try each address.
const hosts = [undefined, "127.0.0.1", "::1"];

const canListen = (port: number, host: string | undefined) =>
  new Promise<boolean>((resolve) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      // A computer without IPv6 cannot have a listener on ::1.
      resolve(error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT");
    });
    server.listen(port, host, () => server.close(() => resolve(true)));
  });

const isAvailable = async (port: number) => {
  for (const host of hosts) {
    if (!(await canListen(port, host))) {
      return false;
    }
  }
  return true;
};

const listener = (port: number) => {
  try {
    return execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
};

const busy = [];
for (const [name, port] of Object.entries(ports)) {
  if (!(await isAvailable(port))) {
    busy.push({ name, port });
  }
}

if (busy.length > 0) {
  for (const { name, port } of busy) {
    console.error(`Port ${port} (${name}) is in use.`);
    const owner = listener(port);
    if (owner) {
      console.error(owner);
    }
  }
  console.error("Stop these processes, then start the dev stack again.");
  process.exit(1);
}
