import { describe, expect, it, vi } from "vitest";
import { saveObjectResponse } from "./save-object-response";

function storedObject() {
  return {
    httpEtag: '"save-etag"',
    writeHttpMetadata(headers: Headers) {
      headers.set("content-type", "application/octet-stream");
    },
  };
}

function bucketReturning(object: unknown) {
  const get = vi.fn().mockResolvedValue(object);
  return { bucket: { get } as unknown as R2Bucket, get };
}

describe("saveObjectResponse", () => {
  it.each(["eu4", "eu5"] as const)("reads a %s save with cacheable metadata", async (game) => {
    const { bucket, get } = bucketReturning({
      ...storedObject(),
      body: new Response("save data").body,
    });
    const conditions = new Headers({ "if-none-match": '"older-save"' });
    const response = await saveObjectResponse(bucket, game, "save-id", conditions);

    expect(get).toHaveBeenCalledExactlyOnceWith(`${game}/save-id`, { onlyIf: conditions });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("save data");
    expect(response.headers.get("etag")).toBe('"save-etag"');
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
  });

  it("returns 404 for a missing save", async () => {
    const { bucket } = bucketReturning(null);
    const response = await saveObjectResponse(bucket, "eu4", "missing", new Headers());
    expect(response.status).toBe(404);
  });

  it("returns 304 when the storage precondition matched", async () => {
    const { bucket } = bucketReturning(storedObject());
    const response = await saveObjectResponse(
      bucket,
      "eu4",
      "save-id",
      new Headers({ "if-none-match": '"save-etag"' }),
    );
    expect(response.status).toBe(304);
    expect(response.body).toBeNull();
    expect(response.headers.get("etag")).toBe('"save-etag"');
  });
});
