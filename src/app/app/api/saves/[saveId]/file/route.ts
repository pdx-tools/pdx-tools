import { withCore } from "@/server-lib/middleware";
import { s3FetchOk, s3Keys } from "@/server-lib/s3";
import { NextRequest } from "next/server";
import { z } from "zod";

export const runtime = "edge";

const saveSchema = z.object({ saveId: z.string() });
export const GET = withCore(
  async (_req: NextRequest, { params }: { params: { saveId: string } }) => {
    const save = saveSchema.parse(params);
    return s3FetchOk(s3Keys.save(save.saveId));
  },
);
