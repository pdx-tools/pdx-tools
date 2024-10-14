import { AwsClient } from "aws4fetch";
import { getEnv } from "./env";
import { log } from "./logging";
import { uploadContentType, UploadType } from "./models";
import { timeit } from "@/lib/timeit";

export const BUCKET = getEnv("VITE_S3_BUCKET");
const defaultHeaders = { service: "s3", region: getEnv("VITE_S3_REGION") };

declare const tag: unique symbol;
export type S3Key = unknown & {
  readonly [tag]: S3Key;
};

export const s3Keys = {
  save: (saveId: string) => `${BUCKET}/${saveId}` as unknown as S3Key,
  preview: (saveId: string) =>
    `${BUCKET}/previews/${saveId}.webp` as unknown as S3Key,
} as const;

const s3client = new AwsClient({
  accessKeyId: getEnv("VITE_S3_ACCESS_KEY"),
  secretAccessKey: getEnv("VITE_S3_SECRET_KEY"),
  region: getEnv("VITE_S3_REGION"),
});

export async function s3Fetch(...args: Parameters<(typeof s3client)["fetch"]>) {
  return args[0] instanceof Request
    ? s3client.fetch(...args)
    : s3client.fetch(
        new URL(args[0].toString(), getEnv("VITE_S3_ENDPOINT")).toString(),
        {
          ...args[1],
          aws: { ...defaultHeaders, ...args[1]?.aws },
        },
      );
}

export async function s3FetchOk(
  ...args: Parameters<(typeof s3client)["fetch"]>
) {
  const res = await s3Fetch(...args);
  if (res.status >= 400) {
    const body = await res.text();
    throw new Error(`s3 responded with ${res.status}: ${body}`);
  }

  return res;
}

export async function s3Presigned(saveId: string): Promise<string> {
  const url = new URL(`${BUCKET}/${saveId}`, getEnv("VITE_S3_ENDPOINT"));
  url.searchParams.set("X-Amz-Expires", "3600");
  const req = await s3client.sign(url.toString(), {
    aws: { ...defaultHeaders, signQuery: true },
  });
  return req.url;
}

export async function uploadFileToS3(
  body: Buffer | Uint8Array,
  filename: string,
  upload: UploadType,
): Promise<void> {
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
}

export async function deleteFile(s3Key: S3Key): Promise<void> {
  await s3FetchOk(s3Key, {
    method: "DELETE",
  });
  log.info({ msg: "deleted s3 file", s3Key });
}
