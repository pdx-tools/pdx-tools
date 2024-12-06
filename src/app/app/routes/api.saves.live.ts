import { ensurePermissions } from "@/lib/auth";
import { timeit } from "@/lib/timeit";
import { getSessionUser } from "@/server-lib/auth/user";
import { ValidationError } from "@/server-lib/errors";
import { pdxFns } from "@/server-lib/functions";
import { liveRoom } from "@/server-lib/live";
import { log } from "@/server-lib/logging";
import { withCore } from "@/server-lib/middleware";
import { contentType } from "@/server-lib/models";
import { pdxCloudflareS3, pdxS3 } from "@/server-lib/s3";
import { ActionFunctionArgs } from "@remix-run/cloudflare";
import { z } from "zod";

const uploadMetadata = z
  .object({
    contentType: contentType(),
  })
  .transform(({ contentType }) => ({ uploadType: contentType }));

const headerMetadata = z
  .object({
    "content-type": contentType(),
  })
  .transform((obj) => ({ uploadType: obj["content-type"] }));

async function fileUploadData(req: Request) {
  const maxFileSize = 20 * 1024 * 1024;
  const contentType = req.headers.get("content-type");
  if (contentType?.toLowerCase()?.includes("form-data")) {
    const form = await timeit(() => req.formData());
    log.info({
      msg: "upload form data",
      elapsedMs: form.elapsedMs.toFixed(2),
    });

    const file = form.data.get("file") as Blob | null;
    if (!file || file.size > maxFileSize) {
      throw new ValidationError("invalid file upload");
    }

    const metadataBody = (form.data.get("metadata") ?? "{}") as string;
    const metadata = uploadMetadata.parse(JSON.parse(metadataBody));
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { bytes, metadata };
  } else {
    const lengthHeader = req.headers.get("content-length");
    if (!(lengthHeader && +lengthHeader < maxFileSize)) {
      throw new ValidationError("invalid file upload");
    }

    const headers = Object.fromEntries(req.headers.entries());
    const metadata = headerMetadata.parse(headers);
    const bytes = new Uint8Array(await req.arrayBuffer());
    return { bytes, metadata };
  }
}

export const action = withCore(
  async ({ request, context }: ActionFunctionArgs) => {
    if (request.method !== "POST") {
      throw Response.json({ msg: "Method not allowed" }, { status: 405 });
    }

    const session = await getSessionUser({ request, context });
    ensurePermissions(session, "savefile:live-update");

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

      const stub = liveRoom(session.id, context);
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
