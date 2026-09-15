import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { googleIdToken } from "./google-auth";

const TOKEN_URI = "https://oauth2.example/token";

let keyJson: string;
let publicKey: CryptoKey;

function b64url(s: string) {
  return Buffer.from(s).toString("base64url");
}

function decodeSegment(seg: string) {
  return JSON.parse(Buffer.from(seg, "base64url").toString());
}

// Fake ID token: only the payload matters (the cache reads `exp` from it).
function fakeIdToken(expSeconds: number) {
  return `${b64url("{}")}.${b64url(JSON.stringify({ exp: expSeconds }))}.sig`;
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  publicKey = pair.publicKey;
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString(
    "base64",
  );
  const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
  keyJson = JSON.stringify({
    client_email: "worker@test.iam.gserviceaccount.com",
    private_key: pem,
    token_uri: TOKEN_URI,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("googleIdToken", () => {
  it("posts a correctly signed assertion and returns the id token", async () => {
    const audience = "https://api-abc.a.run.app";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        Response.json({ id_token: fakeIdToken(Math.floor(Date.now() / 1000) + 3600) }),
      );

    const token = await googleIdToken(keyJson, audience);
    expect(token).toBe(fakeIdToken(Math.floor(Date.now() / 1000) + 3600));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(TOKEN_URI);
    const form = new URLSearchParams(init!.body as URLSearchParams);
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");

    const [header, claims, signature] = form.get("assertion")!.split(".");
    expect(decodeSegment(header)).toEqual({ alg: "RS256", typ: "JWT" });
    const payload = decodeSegment(claims);
    expect(payload).toMatchObject({
      iss: "worker@test.iam.gserviceaccount.com",
      sub: "worker@test.iam.gserviceaccount.com",
      aud: TOKEN_URI,
      target_audience: audience,
    });
    expect(payload.exp - payload.iat).toBe(3600);

    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      Buffer.from(signature, "base64url"),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(ok).toBe(true);
  });

  it("caches the token per audience and refreshes near expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const nowS = () => Math.floor(Date.now() / 1000);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => Response.json({ id_token: fakeIdToken(nowS() + 3600) }));

    const aud = "https://cache.a.run.app";
    const [a, b] = await Promise.all([googleIdToken(keyJson, aud), googleIdToken(keyJson, aud)]);
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A different audience needs its own token.
    await googleIdToken(keyJson, "https://other.a.run.app");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Still fresh 50 minutes in; refreshed once inside the 5 minute margin.
    vi.advanceTimersByTime(50 * 60 * 1000);
    expect(await googleIdToken(keyJson, aud)).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(6 * 60 * 1000);
    expect(await googleIdToken(keyJson, aud)).not.toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries after a failed exchange", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("nope", { status: 401 }))
      .mockResolvedValueOnce(
        Response.json({ id_token: fakeIdToken(Math.floor(Date.now() / 1000) + 3600) }),
      );

    const aud = "https://retry.a.run.app";
    await expect(googleIdToken(keyJson, aud)).rejects.toThrow("google token exchange failed (401)");
    await expect(googleIdToken(keyJson, aud)).resolves.toBeTypeOf("string");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
