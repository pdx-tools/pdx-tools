import { ensurePermissions } from "@/lib/auth";
import { getSessionUser } from "@/server-lib/auth/user";
import { log } from "@/server-lib/logging";
import { withCore } from "@/server-lib/middleware";
import { pdxOg } from "@/server-lib/og";
import { pdxCloudflareS3, pdxS3 } from "@/server-lib/s3";
import { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { z } from "zod";

const saveSchema = z.object({ saveId: z.string() });
export const action = withCore(
  async ({ request, context }: LoaderFunctionArgs) => {
    const session = await getSessionUser({ request, context });
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
