import { log } from "@/server-lib/logging";
import { withCore } from "@/server-lib/middleware";
import { generateOgIntoS3 } from "@/server-lib/og";
import { BUCKET, s3Fetch } from "@/server-lib/s3";
import { NextRequest } from "next/server";
import { z } from "zod";

export const runtime = "edge";

const saveSchema = z.object({ save_id: z.string().regex(/^[a-z0-9_-]*$/i) });
export const GET = withCore(
  async (_req: NextRequest, { params }: { params: { save_id: string } }) => {
    const save = saveSchema.parse(params);

    const s3Key = `${BUCKET}/previews/${save.save_id}`;
    const existing = await s3Fetch(s3Key, {
      method: "GET",
    });

    if (existing.ok) {
      log.info({ msg: "save preview exists", saveId: save.save_id });
      return existing;
    }

    log.info({ msg: "save preview does not exist", saveId: save.save_id });
    return await generateOgIntoS3(save.save_id, s3Key);
  },
);
