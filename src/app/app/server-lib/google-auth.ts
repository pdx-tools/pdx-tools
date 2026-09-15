// Mints Google ID tokens for a service account so the Worker can call a
// Cloud Run service that requires roles/run.invoker.
//
// Flow: sign a JWT with the service-account private key, exchange it at
// Google's token endpoint for an ID token whose `aud` is the target service,
// then send that ID token as a bearer token. Google rejects unauthenticated
// requests before they reach the container, so it never bills a cold start.
//
// The exchange is one request per hour per isolate. The token is cached in
// module scope and refreshed early so concurrent callers share one refresh.

import { z } from "zod";

const serviceAccountKey = z.object({
  client_email: z.string(),
  private_key: z.string(),
  token_uri: z.string().default("https://oauth2.googleapis.com/token"),
});

type ServiceAccountKey = z.infer<typeof serviceAccountKey>;

type CachedToken = { token: string; expiresAt: number };

const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const TOKEN_LIFETIME_S = 3600;

// One cache entry per (service account, audience). The value holds the
// in-flight promise so overlapping callers await the same exchange.
const tokenCache = new Map<string, Promise<CachedToken>>();
const keyCache = new Map<string, Promise<CryptoKey>>();

const encoder = new TextEncoder();

function base64url(data: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof data === "string" ? encoder.encode(data) : new Uint8Array(data);
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/-----BEGIN [A-Z ]+-----/, "")
    .replace(/-----END [A-Z ]+-----/, "")
    .replaceAll(/\s+/g, "");
  const binary = atob(body);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function importPrivateKey(key: ServiceAccountKey): Promise<CryptoKey> {
  let cached = keyCache.get(key.client_email);
  if (!cached) {
    cached = crypto.subtle.importKey(
      "pkcs8",
      pemToDer(key.private_key),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    keyCache.set(key.client_email, cached);
  }
  return cached;
}

async function signJwt(key: ServiceAccountKey, audience: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      sub: key.client_email,
      aud: key.token_uri,
      target_audience: audience,
      iat: now,
      exp: now + TOKEN_LIFETIME_S,
    }),
  );
  const input = `${header}.${claims}`;
  const privateKey = await importPrivateKey(key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    encoder.encode(input),
  );
  return `${input}.${base64url(signature)}`;
}

async function exchangeForIdToken(key: ServiceAccountKey, audience: string): Promise<CachedToken> {
  const assertion = await signJwt(key, audience);
  const resp = await fetch(key.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`google token exchange failed (${resp.status}): ${body}`);
  }

  const { id_token } = z.object({ id_token: z.string() }).parse(await resp.json());

  // Google ID tokens live for one hour. Read `exp` from the token so the cache
  // follows the real lifetime instead of an assumed one.
  const payload = JSON.parse(
    atob(id_token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/")),
  );
  const expiresAt = z.number().parse(payload.exp) * 1000;
  return { token: id_token, expiresAt };
}

/**
 * Returns a Google ID token for `audience`, signed as the service account in
 * `keyJson` (the contents of a service-account key file). Tokens are cached
 * per isolate and refreshed five minutes before they expire.
 */
export async function googleIdToken(keyJson: string, audience: string): Promise<string> {
  const key = serviceAccountKey.parse(JSON.parse(keyJson));
  const cacheKey = `${key.client_email}\n${audience}`;

  const cached = tokenCache.get(cacheKey);
  if (cached) {
    const value = await cached.catch(() => undefined);
    if (value && value.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
      return value.token;
    }
  }

  const fresh = exchangeForIdToken(key, audience);
  tokenCache.set(cacheKey, fresh);
  fresh.catch(() => {
    // Drop a failed exchange so the next caller retries instead of
    // re-awaiting the rejected promise.
    if (tokenCache.get(cacheKey) === fresh) {
      tokenCache.delete(cacheKey);
    }
  });
  return (await fresh).token;
}
