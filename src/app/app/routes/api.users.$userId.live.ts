import { userId } from "@/lib/auth";
import { timeit } from "@/lib/timeit";
import { getSessionUser } from "@/server-lib/auth/user";
import { ValidationError } from "@/server-lib/errors";
import { pdxFns } from "@/server-lib/functions";
import { liveRoom } from "@/server-lib/live";
import { log } from "@/server-lib/logging";
import { withCore } from "@/server-lib/middleware";
import { pdxCloudflareS3, pdxS3 } from "@/server-lib/s3";
import { fileUploadData } from "@/server-lib/uploads";
import { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { z } from "zod";

const UserParams = z.object({ userId: z.string() });
export const loader = withCore(
  async ({ params, request, context }: LoaderFunctionArgs) => {
    const user = UserParams.parse(params);
    const stub = liveRoom(userId(user.userId), context);
    const doUrl = new URL(`/${user.userId}`, request.url);
    return stub.fetch!(new Request(doUrl, request));
  }
);

export const action = withCore(
  async ({ request, context, params }: ActionFunctionArgs) => {
    if (request.method !== "POST") {
      throw Response.json({ msg: "Method not allowed" }, { status: 405 });
    }

    const user = UserParams.parse(params);
    const session = await getSessionUser({ request, context });
    if (user.userId !== session.id) {
      throw Response.json({ msg: "unable to authorize" }, { status: 401 });
    }

    const s3 = pdxS3(pdxCloudflareS3({ context }));
    const s3Key = s3.keys.liveSave(session.id);
    const { bytes, metadata } = await fileUploadData(request);
    const uploadTask = s3.uploadFileToS3(bytes, s3Key, metadata.uploadType);

    try {
      const { data: out, elapsedMs } = await timeit(() =>
        pdxFns({
          endpoint: context.cloudflare.env.PARSE_API_ENDPOINT,
        }).parseSave(bytes)
      );
      log.info({
        user: session.id,
        msg: "parsed live file",
        elapsedMs: elapsedMs.toFixed(2),
      });

      if (out.kind === "InvalidPatch") {
        throw new ValidationError(`unsupported patch: ${out.patch_shorthand}`);
      }

      await uploadTask;

      const stub = liveRoom(userId(user.userId), context);
      context.cloudflare.ctx.waitUntil(stub.notifyListeners(s3Key));
      return new Response(undefined, { status: 204 });
    } catch (ex) {
      const deleteFileFromS3 = uploadTask
        .then(() => s3.deleteFile(s3Key))
        .catch((err) => {
          log.exception(err, { msg: "unable to delete file from s3", s3Key });
        });
      context.cloudflare.ctx.waitUntil(deleteFileFromS3);
      throw ex;
    }
  }
);
