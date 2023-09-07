import { withCore } from "@/server-lib/middleware";
import { BUCKET, s3FetchOk } from "@/server-lib/s3";
import { NextRequest } from "next/server";
import { z } from "zod";

export const runtime = "edge";

const saveSchema = z.object({ saveId: z.string() });
export const GET = withCore(
  async (_req: NextRequest, { params }: { params: { saveId: string } }) => {
    const save = saveSchema.parse(params);
    const resp = await s3FetchOk(`${BUCKET}/${save.saveId}`, {
      cache: "no-store"
    });

    return new Response(resp.body, {
      status: resp.status,
      headers: {
        ...resp.headers,

        // Cache the file for ten minutes in the browser,
        // Consider it fresh on the cdn for one day
        // Allow cache to reuse response for six more days
        "Cache-Control":
          "public, max-age=600, s-maxage=86400, stale-while-revalidate=518400",
      },
    });
  },
);
