import { NextApiResponse } from "next";
import crypto from "crypto";
import { withCoreMiddleware } from "@/server-lib/middlware";
import { NextSessionRequest, withSession } from "@/server-lib/session";
import { NewKeyResponse } from "@/services/appApi";
import { apiKeyAtRest } from "@/server-lib/db";
import { log } from "@/server-lib/logging";
import { db, table } from "@/server-lib/db";
import { eq } from "drizzle-orm";

const handler = async (req: NextSessionRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.status(405).json({ msg: "method not allowed" });
    return;
  }

  // https://news.ycombinator.com/item?id=16009109
  // - crypto random bytes
  // - convert it to pseudo-base62
  // - stored as base64url of sha256
  const data = await new Promise<Buffer>((resolve, reject) => {
    crypto.randomBytes(16, (err, buf) => {
      if (err) {
        reject(err);
      } else {
        resolve(buf);
      }
    });
  });

  const raw = data
    .toString("base64url")
    .replaceAll(/[-_]/g, (...args) => String.fromCharCode(65 + args[1]));

  const newKey = `pdx_${raw}`;
  await db
    .update(table.users)
    .set({ apiKey: apiKeyAtRest(newKey) })
    .where(eq(table.users.userId, req.sessionUid));

  const result: NewKeyResponse = {
    api_key: newKey,
  };
  res.json(result);
};

export default withCoreMiddleware(withSession(handler));
