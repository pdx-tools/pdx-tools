import { withCore } from "@/server-lib/middleware";
import { BUCKET, s3FetchOk } from "@/server-lib/s3";
import { NextRequest } from "next/server";
import { z } from "zod";

export const runtime = "edge";

const saveSchema = z.object({ saveId: z.string() });
export const GET = (
  req: NextRequest,
  { params }: { params: { saveId: string } },
) => {
  const ifnm = req.headers.get("if-none-match");
  return withCore(async (_req) => {
    const save = saveSchema.parse(params);
    const resp = await s3FetchOk(`${BUCKET}/${save.saveId}`, {
      headers: {
        ...(ifnm ? { "If-None-Match": ifnm } : {}),
      },
    });
    return new Response(resp.body, {
      status: resp.status,
      headers: resp.headers,
    });
  })(req);
};
