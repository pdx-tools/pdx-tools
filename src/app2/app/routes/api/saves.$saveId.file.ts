import { s3FetchOk, s3Keys } from "@/server-lib/s3";
import { createAPIFileRoute } from "@tanstack/start/api";
import { z } from "zod";

const saveSchema = z.object({ saveId: z.string() });
export const Route = createAPIFileRoute("/api/saves/$saveId/file")({
  GET: ({ params }) => {
    const save = saveSchema.parse(params);
    return s3FetchOk(s3Keys.save(save.saveId));
  },
});
