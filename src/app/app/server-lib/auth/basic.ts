export function parseBasicAuth(header: string) {
  const space = header.indexOf(" ");
  if (space <= 0) {
    return null;
  }

  const method = header.substring(0, space);
  if (method.toLowerCase() !== "basic") {
    return null;
  }

  const rest = header.substring(space + 1);
  const decoded = Buffer.from(rest, "base64url").toString("utf-8");
  const sep = decoded.indexOf(":");
  if (sep <= 0) {
    return null;
  }

  const username = decoded.substring(0, sep);
  const password = decoded.substring(sep + 1);
  return { username, password };
}
