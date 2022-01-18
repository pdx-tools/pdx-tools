import { ValidationError } from "./errors";

export type UploadType = "gzipText" | "brText" | "brTar" | "zip";
export function uploadType(type: string, encoding: string | null): UploadType {
  if (encoding?.toLowerCase() === "gzip") {
    return "gzipText";
  } else if (encoding?.toLowerCase() == "br") {
    if (type.toLowerCase() == "application/x-tar") {
      return "brTar";
    } else if (type.toLowerCase().startsWith("text/plain")) {
      return "brText";
    } else {
      throw new ValidationError("unknown content and encoding combination");
    }
  } else if (type.toLowerCase() === "application/zip") {
    return "zip";
  } else {
    throw new ValidationError("unknown content and encoding combination");
  }
}

export function uploadContentEncoding(upload: UploadType): string | undefined {
  switch (upload) {
    case "gzipText":
      return "gzip";
    case "brTar":
    case "brText":
      return "br";
    case "zip":
      return undefined;
  }
}

export function uploadContentType(upload: UploadType): string {
  // It's debateable if charset=windows-1252 is valid, as it is not
  // one of the official sanctioned "ISO-8859-X" formats listed in the spec:
  // https://tools.ietf.org/html/rfc2046 . But it appears that some people
  // use it: https://stackoverflow.com/q/16448409/433785
  switch (upload) {
    case "brText":
    case "gzipText":
      return "text/plain; charset=windows-1252";
    case "brTar":
      return "application/x-tar";
    case "zip":
      return "application/octet-stream";
  }
}
