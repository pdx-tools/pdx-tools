import { getAuth } from "@/server-lib/auth/session";
import { apiKeyAtRest, table } from "@/server-lib/db";
import { withDb } from "@/server-lib/db/middleware";
import { withCore } from "@/server-lib/middleware";
import { ActionFunctionArgs, json } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";

export const action = withCore(
  withDb(async ({ request, context }: ActionFunctionArgs, { db }) => {
    const session = await getAuth({ request, context });

    // https://news.ycombinator.com/item?id=16009109
    // - crypto random bytes
    // - convert it to pseudo-base62
    // - stored as base64url of sha256
    const data = new Uint8Array(16);

    // Sub this out for something that is actually random
    crypto.getRandomValues(data);

    const raw = Buffer.from(data)
      .toString("base64url")
      .replaceAll(/[-_]/g, (...args) => String.fromCharCode(65 + args[1]));

    const newKey = `pdx_${raw}`;
    const apiKey = await apiKeyAtRest(newKey);
    await db
      .update(table.users)
      .set({ apiKey })
      .where(eq(table.users.userId, session.id));

    return json({ api_key: newKey });
  }),
);
