import { withAdmin } from '@/server-lib/auth/middleware'
import { withCore } from '@/server-lib/middleware'
import { generateOgIntoS3 } from '@/server-lib/og';
import { json } from '@tanstack/start'
import { createAPIFileRoute } from '@tanstack/start/api'
import { z } from 'zod';

const saveSchema = z.object({ saveId: z.string() });
export const Route = createAPIFileRoute('/api/admin/og')({
  GET: withCore(withAdmin(async ({ request }) => {
    const body = await request.json();
    const save = saveSchema.parse(body);
    generateOgIntoS3(save.saveId);
    return json({ msg: "done" });
  })),
})
