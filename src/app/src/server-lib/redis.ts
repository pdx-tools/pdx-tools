import { createClient } from "redis";
import { getEnv } from "./env";

const _redisClient = createClient({
  url: getEnv("REDIS_URL"),
});

let connectPromise: Promise<void> | undefined = undefined;

export const redisClient = async () => {
  if (connectPromise === undefined) {
    connectPromise = _redisClient.connect();
  }

  await connectPromise;
  return _redisClient;
};

export const remainingSaveSlots = async (uid: string) => {
  const client = await redisClient();
  const slotsUsed = await client.zScore("user_uploads_used_save_slots", uid);
  const used = slotsUsed ?? 0;
  return 100 - used;
};
