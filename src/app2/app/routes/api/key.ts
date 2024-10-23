import { withAuth } from '@/server-lib/auth/middleware'
import { apiKeyAtRest, dbPool, table } from '@/server-lib/db'
import { withCore } from '@/server-lib/middleware'
import { json } from '@tanstack/start'
import { createAPIFileRoute } from '@tanstack/start/api'
import { eq } from 'drizzle-orm'

export const Route = createAPIFileRoute('/api/key')({
  POST: withCore(withAuth(async ({ request, params }, { session }) => {
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
  const db = dbPool().orm;
  await db
    .update(table.users)
    .set({ apiKey })
    .where(eq(table.users.userId, session.uid));

  return json({ api_key: newKey });
  })),
})
