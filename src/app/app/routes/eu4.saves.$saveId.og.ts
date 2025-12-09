import { pdxCloudflareS3, pdxS3 } from "@/server-lib/s3";
import { z } from "zod";
import type { Route } from "./+types/eu4.saves.$saveId.og";

const saveSchema = z.object({ saveId: z.string().regex(/^[a-z0-9_-]*$/i) });
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const save = saveSchema.parse(params);
  const s3 = pdxS3(pdxCloudflareS3({ context }));
  return s3.fetch(s3.keys.preview(save.saveId), {
    headers: s3.headers(request.headers),
  });
}
