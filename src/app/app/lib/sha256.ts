export async function sha256(data: Uint8Array<ArrayBuffer> | ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(digest, (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function sha256File(file: Blob): Promise<string> {
  return sha256(await file.arrayBuffer());
}
