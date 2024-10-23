import { s3Fetch, s3Keys } from '@/server-lib/s3';
import { createAPIFileRoute } from '@tanstack/start/api'
import { z } from 'zod';

const saveSchema = z.object({ saveId: z.string().regex(/^[a-z0-9_-]*$/i) });
export const Route = createAPIFileRoute('/api/saves/$saveId/og')({
  GET: ({ request, params }) => {
    const save = saveSchema.parse(params);
    return s3Fetch(s3Keys.preview(save.saveId));
  },
})
