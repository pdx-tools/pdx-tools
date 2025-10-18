import { ensurePermissions } from "@/lib/auth";
import { getAuth } from "@/server-lib/auth/session";
import { log } from "@/server-lib/logging";
import { withCore } from "@/server-lib/middleware";
import { pdxOg } from "@/server-lib/og";
import { pdxCloudflareS3, pdxS3 } from "@/server-lib/s3";
import { z } from "zod";
import type { Route } from "./+types/api.admin.og";

const saveSchema = z.object({ saveId: z.string() });
export const action = withCore(
  async ({ request, context }: Route.ActionArgs) => {
    const session = await getAuth({ request, context });
    ensurePermissions(session, "savefile:og-request");
    const body = await request.json();
    const save = saveSchema.parse(body);
    const s3 = pdxS3(pdxCloudflareS3({ context }));
    const task = pdxOg({ s3, context })
      .generateOgIntoS3(save.saveId)
      .catch((err) => {
        log.exception(err, {
          msg: "unable to generate og image",
          saveId: save.saveId,
        });
      });
    context.cloudflare.ctx.waitUntil(task);
    return Response.json({ msg: "done" });
  },
);
