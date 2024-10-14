import { AwsClient } from "aws4fetch";
import { log } from "./logging";
import { uploadContentType, UploadType } from "./models";
import { timeit } from "@/lib/timeit";
import { AppLoadContext } from "@remix-run/cloudflare";

declare const tag: unique symbol;
export type S3Key = unknown & {
  readonly [tag]: S3Key;
};

export const pdxS3 = ({ context }: { context: AppLoadContext }) => {
  const s3client = new AwsClient({
    accessKeyId: context.cloudflare.env.S3_ACCESS_KEY,
    secretAccessKey: context.cloudflare.env.S3_SECRET_KEY,
    region: context.cloudflare.env.S3_REGION,
  });

  const defaultHeaders = {
    service: "s3",
    region: context.cloudflare.env.S3_REGION,
  };

  const s3Fetch = (...args: Parameters<(typeof s3client)["fetch"]>) => {
    return args[0] instanceof Request
      ? s3client.fetch(...args)
      : s3client.fetch(
          new URL(
            args[0].toString(),
            context.cloudflare.env.S3_ENDPOINT,
          ).toString(),
          {
            ...args[1],
            aws: { ...defaultHeaders, ...args[1]?.aws },
          },
        );
  };

  const s3FetchOk = async (...args: Parameters<(typeof s3client)["fetch"]>) => {
    const res = await s3Fetch(...args);
    if (res.status >= 400) {
      const body = await res.text();
      throw new Error(`s3 responded with ${res.status}: ${body}`);
    }

    return res;
  };

  const bucket = context.cloudflare.env.S3_BUCKET;
  const s3Keys = {
    save: (saveId: string) => `${bucket}/${saveId}` as unknown as S3Key,
    preview: (saveId: string) =>
      `${bucket}/previews/${saveId}.webp` as unknown as S3Key,
  } as const;

  return {
    keys: s3Keys,
    bucket,
    fetch: s3Fetch,
    fetchOk: s3FetchOk,
    presigned: async (saveId: string) => {
      const url = new URL(
        `${bucket}/${saveId}`,
        context.cloudflare.env.S3_ENDPOINT,
      );
      url.searchParams.set("X-Amz-Expires", "3600");
      const req = await s3client.sign(url.toString(), {
        aws: { ...defaultHeaders, signQuery: true },
      });
      return req.url;
    },

    uploadFileToS3: async (
      body: Buffer | Uint8Array,
      filename: string,
      upload: UploadType,
    ) => {
      const contentType = uploadContentType(upload);
      const put = await timeit(() =>
        s3FetchOk(s3Keys.save(filename), {
          method: "PUT",
          body,
          headers: {
            "Content-Type": contentType,
            "Content-Length": `${body.length}`,
          },
        }),
      );

      log.info({
        msg: "uploaded a new file to s3",
        key: filename,
        bytes: body.length,
        elapsedMs: put.elapsedMs.toFixed(2),
      });
    },

    deleteFile: async (s3Key: S3Key) => {
      await s3FetchOk(s3Key, {
        method: "DELETE",
      });
      log.info({ msg: "deleted s3 file", s3Key });
    },
  };
};
