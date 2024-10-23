import { dbPool, fromParsedSave, table } from '@/server-lib/db';
import { log } from '@/server-lib/logging';
import { ParsedFile } from '@/server-lib/save-parser';
import { json } from '@tanstack/start'
import { createAPIFileRoute } from '@tanstack/start/api'
import { eq } from 'drizzle-orm';

type ReprocessEntry = {
  saveId: string;
  save: Partial<ParsedFile>;
};

export const Route = createAPIFileRoute('/api/admin/reprocess')({
  GET: async ({ request, params }) => {
    const saves: ReprocessEntry[] = await request.json();
    const db = dbPool().orm;
    for (const save of saves) {
      const update = fromParsedSave(save.save);
      log.info({ saveId: save.saveId, msg: "updating to", update });
      await db
        .update(table.saves)
        .set(update)
        .where(eq(table.saves.id, save.saveId));
    }
  
    return json(null, { status: 204 });
  },
})
