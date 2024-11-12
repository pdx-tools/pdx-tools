import { pdxCloudflareS3, pdxS3 } from "@/server-lib/s3";
import { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { z } from "zod";

const saveSchema = z.object({ saveId: z.string().regex(/^[a-z0-9_-]*$/i) });
export async function loader({ params, context }: LoaderFunctionArgs) {
  const save = saveSchema.parse(params);
  const s3 = pdxS3(pdxCloudflareS3({ context }));
  return s3.fetch(s3.keys.preview(save.saveId));
}
