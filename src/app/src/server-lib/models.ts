import { z } from "zod";

export type UploadType = "zip" | "zstd";
export function deduceUploadType(type: string): UploadType | null {
  if (type.toLowerCase() === "application/zip") {
    return "zip";
  } else if (type.toLowerCase() === "application/zstd") {
    return "zstd";
  } else {
    return null;
  }
}

export function uploadContentType(upload: UploadType): string {
  switch (upload) {
    case "zip":
      return "application/zip";
    case "zstd":
      return "application/zstd";
  }
}

// https://github.com/sindresorhus/filename-reserved-regex/blob/main/index.js
const filename = () =>
  z
    .string()
    .max(255)
    .refine((path) => !/[<>:"/\\|?*\u0000-\u001F]/g.test(path), {
      message: "invalid file path characters",
    });

const contentType = () =>
  z.string().transform((val, ctx) => {
    const deduced = deduceUploadType(val);
    if (deduced === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unrecognized upload type",
      });

      return z.NEVER;
    } else {
      return deduced;
    }
  });

export const headerMetadata = z
  .object({
    "pdx-tools-filename": filename().optional(),
    "rakaly-filename": filename().optional(),
    "content-type": contentType(),
  })
  .transform((val, ctx) => {
    const filename = val["pdx-tools-filename"] ?? val["rakaly-filename"];
    if (!filename) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "must provide filename",
      });

      return z.NEVER;
    }

    return {
      aar: "",
      filename,
      uploadType: val["content-type"],
    };
  });

export const uploadMetadata = z
  .object({
    aar: z
      .string()
      .max(5000)
      .nullish()
      .transform((x) => x ?? ""),
    filename: filename(),
    content_type: contentType(),
  })
  .transform(({ content_type, ...rest }) => ({
    ...rest,
    uploadType: content_type,
  }));

export type UploadMetadaInput = z.input<typeof uploadMetadata>;
export type UploadMetadata = z.infer<typeof uploadMetadata>;
export interface SavePostResponse {
  save_id: string;
}
