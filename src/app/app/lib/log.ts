import { getIsDeveloper } from "@/lib/isDeveloper";
import { formatInt } from "./format";

export function log(...data: unknown[]) {
  console.log(`${new Date().toISOString()}:`, ...data);
}

export function logMs(
  { elapsedMs }: { elapsedMs: number },
  ...data: unknown[]
) {
  const ms = formatInt(elapsedMs).padStart(5, " ");
  log(`[${ms}ms]`, ...data);
}

let cachedDeveloper: boolean | undefined;
export function developerLog(msg: string) {
  if (cachedDeveloper ?? (cachedDeveloper = getIsDeveloper())) {
    console.log(`${new Date().toISOString()}: %c${msg}`, "color: #FF7D59");
  }
}
