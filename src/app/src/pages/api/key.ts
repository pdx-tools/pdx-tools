import { NextApiResponse } from "next";
import crypto from "crypto";
import { withCoreMiddleware } from "../../server-lib/middlware";
import { NextSessionRequest, withSession } from "../../server-lib/session";
import { redisClient } from "../../server-lib/redis";
import { NewKeyResponse } from "../../services/rakalyApi";

const handler = async (req: NextSessionRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.status(405).json({ msg: "method not allowed" });
    return;
  }

  const data = await new Promise<Buffer>((resolve, reject) => {
    crypto.randomBytes(32, (err, buf) => {
      if (err) {
        reject(err);
      } else {
        resolve(buf);
      }
    });
  });

  const newKey = data.toString("base64url");
  const redis = await redisClient();
  await redis.set(`api_key:${req.sessionUid}`, newKey);
  const result: NewKeyResponse = {
    api_key: newKey,
  };
  res.json(result);
};

export default withCoreMiddleware(withSession(handler));
