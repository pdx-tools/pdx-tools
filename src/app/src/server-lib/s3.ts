import fs from "fs";
import AWS, { S3 } from "aws-sdk";
import { metrics } from "./metrics";
import { getEnv, isLocal } from "./env";
import { log } from "./logging";
import { uploadContentEncoding, uploadContentType, UploadType } from "./models";
import { Agent as HttpAgent } from "http";

export const BUCKET = getEnv("S3_BUCKET");
const endpoint = getEnv("S3_ENDPOINT");

AWS.config.logger = {
  // log: (msg) => log.info({ msg }),
  warn: (msg) => log.warn({ msg }),
};

if (isLocal()) {
  AWS.config.update({
    httpOptions: {
      agent: new HttpAgent(),
    },
  });
}

export const s3client = new S3({
  endpoint,
  credentials: {
    accessKeyId: getEnv("S3_ACCESS_KEY"),
    secretAccessKey: getEnv("S3_SECRET_KEY"),
  },
  s3ForcePathStyle: true,
  region: getEnv("S3_REGION"),
});

const timeHistogram = new metrics.Histogram({
  name: "s3_upload_seconds",
  help: "s3 upload seconds",
});

const sizeHistogram = new metrics.Histogram({
  name: "s3_upload_bytes",
  help: "s3 upload bytes",
  buckets: [
    1.0, 100_000.0, 2_000_000.0, 4_000_000.0, 6_000_000.0, 8_000_000.0,
    10_000_000.0, 12_000_000.0, 14_000_000.0, 16_000_000.0, 18_000_000.0,
    20_000_000.0,
  ],
});

export async function uploadFileToS3(
  filePath: string,
  filename: string,
  upload: UploadType
): Promise<void> {
  const contentEncoding = uploadContentEncoding(upload);
  const contentType = uploadContentType(upload);

  const end = timeHistogram.startTimer();
  const { size: bytes } = await fs.promises.stat(filePath);
  const stream = fs.createReadStream(filePath);

  await s3client
    .putObject({
      Bucket: BUCKET,
      Key: filename,
      Body: stream,
      ContentType: contentType,
      ContentEncoding: contentEncoding,
    })
    .promise();

  const elapse = end();
  log.info({
    msg: "uploaded a new file to s3",
    key: filename,
    bytes,
    elapsedMs: (elapse * 1000).toFixed(2),
  });
  sizeHistogram.observe(bytes);
}

export async function deleteFile(saveId: string): Promise<void> {
  await s3client
    .deleteObject({
      Bucket: BUCKET,
      Key: saveId,
    })
    .promise();
}

export async function presigned(saveId: string): Promise<string> {
  return s3client.getSignedUrlPromise("getObject", {
    Bucket: BUCKET,
    Key: saveId,
  });
}
