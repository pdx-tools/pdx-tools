import { withCore } from "@/server-lib/middleware";
import { generateOgIntoS3 } from "@/server-lib/og";
import { BUCKET, s3Fetch, s3FetchOk } from "@/server-lib/s3";
import { NextRequest } from "next/server";
import { z } from "zod";

export const runtime = "edge";

const saveSchema = z.object({ saveId: z.string().regex(/^[a-z0-9_-]*$/i) });
export const GET = withCore(
  async (_req: NextRequest, { params }: { params: { saveId: string } }) => {
    const save = saveSchema.parse(params);

    const s3Key = `${BUCKET}/previews/${save.saveId}`;
    const existing = await s3Fetch(s3Key, {
      method: "GET",
    });

    if (existing.ok) {
      return existing;
    }

    return await generateOgIntoS3(save.saveId, s3Key);
  },
);
