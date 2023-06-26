import { ValidationError } from "./errors";

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
