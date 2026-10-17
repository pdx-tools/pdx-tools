import { saveKey } from "./storage";

/** Read a public save and preserve its HTTP conditions and metadata. */
export async function saveObjectResponse(
  bucket: R2Bucket,
  game: "eu4" | "eu5",
  id: string,
  onlyIf: Headers,
) {
  const object = await bucket.get(saveKey(game, id), { onlyIf });
  if (object === null) return new Response(null, { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  // The production Cache API stores responses only with a cacheable Cache-Control value.
  headers.set("Cache-Control", "public, max-age=86400");
  // A bodyless R2 object means the precondition matched. Return 304 so production
  // does not cache the response.
  return new Response("body" in object ? object.body : null, {
    status: "body" in object ? 200 : 304,
    headers,
  });
}
