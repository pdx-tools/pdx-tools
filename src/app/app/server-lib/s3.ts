import { AwsClient } from "aws4fetch";
import { log } from "./logging";
import { uploadContentType } from "./models";
import type { UploadType } from "./models";
import { timeit } from "@/lib/timeit";
import type { AppLoadContext } from "react-router";

declare const tag: unique symbol;
export type S3Key = unknown & {
  readonly [tag]: S3Key;
};

type S3Connection = {
  accessKey: string;
  secretKey: string;
  region: string;
  bucket: string;
  endpoint: string;
};

export const pdxCloudflareS3 = ({ context }: { context: AppLoadContext }) => ({
  accessKey: context.cloudflare.env.S3_ACCESS_KEY,
  secretKey: context.cloudflare.env.S3_SECRET_KEY,
  region: context.cloudflare.env.S3_REGION,
  bucket: context.cloudflare.env.S3_BUCKET,
  endpoint: context.cloudflare.env.S3_ENDPOINT,
});

export const pdxS3 = ({
  accessKey,
  secretKey,
  region,
  bucket,
  endpoint,
}: S3Connection) => {
  console.log("Creating S3 client with endpoint", endpoint);
  const s3client = new AwsClient({
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
    region,
  });

  const defaultHeaders = {
    service: "s3",
    region,
  };

  const s3Url = (arg: { toString: () => string }) =>
    new URL(arg.toString(), endpoint);

  const s3Fetch = (...args: Parameters<(typeof s3client)["fetch"]>) => {
    return args[0] instanceof Request
      ? s3client.fetch(...args)
      : s3client.fetch(s3Url(args[0]).toString(), {
          ...args[1],
          aws: { ...defaultHeaders, ...args[1]?.aws },
        });
  };

  const s3FetchOk = async (...args: Parameters<(typeof s3client)["fetch"]>) => {
    const res = await s3Fetch(...args);
    if (res.status >= 400) {
      const body = await res.text();
      throw new Error(`s3 responded with ${res.status}: ${body}`);
    }

    return res;
  };

  const s3Keys = {
    save: (saveId: string) => `${bucket}/${saveId}` as unknown as S3Key,
    preview: (saveId: string) =>
      `${bucket}/previews/${saveId}.webp` as unknown as S3Key,
  } as const;

  return {
    keys: s3Keys,

    // Given an original request's headers, create a new set of headers to
    // forward onto the s3 provider
    headers: (headers: Headers) => {
      const newHeaders = new Headers();
      for (const header of ["If-None-Match"]) {
        const inm = headers.get(header);
        if (inm) {
          newHeaders.set(header, inm);
        }
      }

      return newHeaders;
    },
    bucket,
    url: s3Url,
    fetch: s3Fetch,
    fetchOk: s3FetchOk,
    presigned: async (saveId: string) => {
      const url = new URL(`${bucket}/${saveId}`, endpoint);
      url.searchParams.set("X-Amz-Expires", "3600");
      const req = await s3client.sign(url.toString(), {
        aws: { ...defaultHeaders, signQuery: true },
      });
      return req.url;
    },

    uploadFileToS3: async (
      body: Buffer<ArrayBuffer> | Uint8Array<ArrayBuffer>,
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
