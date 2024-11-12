import { getAdmin } from "@/server-lib/auth/session";
import { withCore } from "@/server-lib/middleware";
import { pdxOg } from "@/server-lib/og";
import { pdxCloudflareS3, pdxS3 } from "@/server-lib/s3";
import { json, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { z } from "zod";

const saveSchema = z.object({ saveId: z.string() });
export const action = withCore(
  async ({ request, context }: LoaderFunctionArgs) => {
    await getAdmin({ request, context });
    const body = await request.json();
    const save = saveSchema.parse(body);
    const s3 = pdxS3(pdxCloudflareS3({ context }));
    pdxOg({ s3, context }).generateOgIntoS3(save.saveId);
    return json({ msg: "done" });
  },
);
