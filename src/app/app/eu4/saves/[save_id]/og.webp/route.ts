import { withCore } from "@/server-lib/middleware";
import { s3Fetch, s3Keys } from "@/server-lib/s3";
import { NextRequest } from "next/server";
import { z } from "zod";

export const runtime = "edge";

const saveSchema = z.object({ save_id: z.string().regex(/^[a-z0-9_-]*$/i) });
export const GET = withCore(
  async (_req: NextRequest, { params }: { params: { save_id: string } }) => {
    const save = saveSchema.parse(params);
    return s3Fetch(s3Keys.preview(save.save_id));
  },
);
