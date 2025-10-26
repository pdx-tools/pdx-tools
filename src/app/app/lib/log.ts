import { getIsDeveloper } from "@/lib/isDeveloper";

export function log(...data: unknown[]) {
  console.log(`${new Date().toISOString()}:`, ...data);
}

let cachedDeveloper: boolean | undefined;
export function developerLog(msg: string) {
  if (cachedDeveloper ?? (cachedDeveloper = getIsDeveloper())) {
    console.log(`${new Date().toISOString()}: %c${msg}`, "color: #FF7D59");
  }
}
