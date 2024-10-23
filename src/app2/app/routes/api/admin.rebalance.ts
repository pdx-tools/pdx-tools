import { withAdmin } from '@/server-lib/auth/middleware'
import { dbPool, table } from '@/server-lib/db'
import { latestEu4MinorPatch } from '@/server-lib/game'
import { withCore } from '@/server-lib/middleware'
import { json } from '@tanstack/start'
import { createAPIFileRoute } from '@tanstack/start/api'
import { sql } from 'drizzle-orm'

export const Route = createAPIFileRoute('/api/admin/rebalance')({
  GET: withCore(withAdmin(async ({ request, params }) => {
    const db = dbPool().orm;
    const patch =
      new URL(request.url).searchParams.get("__patch_override_for_testing") ??
      latestEu4MinorPatch();
  
    await db
      .update(table.saves)
      .set({
        scoreDays: sql`days * (10 + (${+patch} - LEAST(save_version_second, ${+patch}))) / 10`,
      })
      .where(sql`cardinality(${table.saves.achieveIds}) != 0`);
  
    return json({ msg: "done" });
  })),
})
