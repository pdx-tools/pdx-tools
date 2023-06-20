import { ValidationError } from "./errors";

export type UploadType = "zip" | "zstd";
export function deduceUploadType(type: string): UploadType {
  if (type.toLowerCase() === "application/zip") {
    return "zip";
  } else if (type.toLowerCase() === "application/zstd") {
    return "zstd";
  } else {
    throw new ValidationError("unknown content and encoding combination");
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
