import { get, set } from "@/lib/idb-keyval";

let fallbackData: Uint8Array | undefined = undefined;

export async function setRawData(data: Uint8Array) {
  fallbackData = undefined;

  // prefer to store it in indexdb so we don't have to keep the raw file in memory.
  try {
    await set("data", data);
  } catch (e) {
    // indexdb is not available so let's fallback to storing it in memory
    fallbackData = data;
  }
}

export async function getRawData(): Promise<Uint8Array> {
  if (fallbackData) {
    return fallbackData;
  }

  const storedData = await get("data");
  if (storedData === undefined) {
    throw new Error("cached data missing");
  }

  return storedData;
}
