import { pdxCloudflareS3, pdxS3 } from "@/server-lib/s3";
import { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { z } from "zod";

const saveSchema = z.object({ saveId: z.string() });
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const save = saveSchema.parse(params);
  const s3 = pdxS3(pdxCloudflareS3({ context }));
  return s3.fetchOk(s3.keys.save(save.saveId), {
    headers: s3.headers(request.headers),
  });
}
