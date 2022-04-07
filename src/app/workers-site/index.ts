import {
  getAssetFromKV,
  mapRequestToAsset,
} from "@cloudflare/kv-asset-handler";
import { AwsClient } from "aws4fetch";

declare global {
  const AWS_ACCESS_KEY_ID: string;
  const AWS_SECRET_ACCESS_KEY: string;
  const AWS_DEFAULT_REGION: string;
  const AWS_S3_HOST: string;
  const AWS_S3_BUCKET: string | undefined;
}

const CACHE_AGE = 8640000;
const assetCacheControl = { browserTTL: CACHE_AGE };

const aws = new AwsClient({
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
  region: AWS_DEFAULT_REGION,
  service: "s3",
});

let getSaveRe = /^\/api\/saves\/([A-Za-z0-9_-]+)\/file$/;

addEventListener("fetch", (event: FetchEvent) => {
  try {
    event.passThroughOnException();
    const parsedUrl = new URL(event.request.url);
    const path = parsedUrl.pathname;
    const matches = getSaveRe.exec(path);
    if (matches && matches.length === 2) {
      const saveId = matches[1];
      event.respondWith(fetchS3(event, saveId));
    } else if (path.startsWith("/api/tunnel")) {
      event.respondWith(tunnelSentry(event.request));
    } else if (path === "/api/profile") {
      // pre-emptively answer guest queries so they don't require
      // the request to hit the origin server for guest accounts
      const cookie = event.request.headers.get("Cookie");
      if (cookie && cookie.indexOf("session") !== -1) {
        return;
      } else {
        const data = { kind: "guest" };
        const json = JSON.stringify(data);
        const response = new Response(json, {
          headers: {
            "Content-Type": "application/json",
          },
        });
        event.respondWith(response);
      }
    } else if (path.startsWith("/api") || path.startsWith("/admin")) {
      return;
    } else if (path.startsWith("/blog")) {
      event.respondWith(handleBlogEvent(event));
    } else {
      event.respondWith(handleEvent(event));
    }
  } catch (e) {
    event.respondWith(new Response("Internal Error", { status: 500 }));
  }
});

async function fetchS3(event: FetchEvent, saveId: string) {
  const cache = caches.default;
  let response = await cache.match(event.request.url);

  if (!response) {
    const url = new URL(event.request.url);
    url.hostname = AWS_S3_HOST;

    // For minio to avoid setting up virtual host configuration
    if (AWS_S3_BUCKET) {
      url.pathname = `/${AWS_S3_BUCKET}/${saveId}`;
    } else {
      url.pathname = `/${saveId}`;
    }

    const signedRequest = await aws.sign(url.toString());
    response = await fetch(signedRequest, { cf: { cacheEverything: true } });

    if (response.ok) {
      response = new Response(response.body, response);

      // Cache for 10 days
      response.headers.set("Cache-Control", "max-age=864000");
      event.waitUntil(cache.put(event.request.url, response.clone()));
    }
  }

  return response;
}

// https://github.com/getsentry/examples/blob/5089b00a764b4ce3d1d9bc77174c68bc4dffb387/tunneling/nextjs/pages/api/tunnel.js
async function tunnelSentry(req: Request) {
  try {
    const envelope = await req.text();
    const pieces = envelope.split("\n");

    const header = JSON.parse(pieces[0]);

    const { host, pathname } = new URL(header.dsn);
    const sentryHost = "o510976.ingest.sentry.io";
    if (host !== sentryHost) {
      throw new Error(`invalid host: ${host}`);
    }

    const knownProjectIds = ["5607403"];
    const projectId = pathname.slice(1);
    if (!knownProjectIds.includes(projectId)) {
      throw new Error(`invalid project id: ${projectId}`);
    }

    const url = `https://${sentryHost}/api/${projectId}/envelope/`;
    return await fetch(url, { method: "POST", body: envelope });
  } catch (e) {
    return new Response("bad request", { status: 400 });
  }
}

function calcCacheControl(event: FetchEvent) {
  const parsedUrl = new URL(event.request.url);
  const pathname = parsedUrl.pathname;
  const extension = pathname.split(".").pop();
  const cacheable = [
    "js",
    "css",
    "png",
    "jpg",
    "jpeg",
    "wasm",
    "webp",
    "bin",
    "frag",
    "vert",
  ];
  const isCacheable = extension && cacheable.indexOf(extension) !== -1;
  return isCacheable ? assetCacheControl : undefined;
}

function assetRequest(request: Request) {
  const parsedUrl = new URL(request.url);
  const hasExtension = parsedUrl.pathname.indexOf(".") !== -1;
  if (parsedUrl.pathname == "/") {
    return mapRequestToAsset(new Request(request.url, request));
  } else if (hasExtension) {
    // skip mapRequestToAsset as else it will think unrecognized mime types like
    // frag and vert are directories
    return new Request(request.url, request);
  } else {
    if (parsedUrl.pathname.startsWith("/eu4/saves")) {
      parsedUrl.pathname = `/eu4/saves/[save_id].html`;
    } else if (
      parsedUrl.pathname.startsWith("/eu4/achievements/") &&
      parsedUrl.pathname !== "/eu4/achievements/"
    ) {
      parsedUrl.pathname = `/eu4/achievements/[achievement_id].html`;
    } else if (
      parsedUrl.pathname.startsWith("/eu4/skanderbeg/") &&
      parsedUrl.pathname !== "/eu4/skanderbeg/"
    ) {
      parsedUrl.pathname = `/eu4/skanderbeg/[skan_id].html`;
    } else if (
      parsedUrl.pathname.startsWith("/users/") &&
      parsedUrl.pathname !== "/users/"
    ) {
      parsedUrl.pathname = `/users/[user_id].html`;
    } else {
      parsedUrl.pathname = `${parsedUrl.pathname}.html`;
    }
    return mapRequestToAsset(new Request(parsedUrl.toString(), request));
  }
}

function withSecurityHeaders(response: Response, pathname: string) {
  const newResponse = new Response(response.body, response);
  newResponse.headers.set("Strict-Transport-Security", `max-age=${CACHE_AGE}`);

  // pdxu embeds this in an iframe.
  if (pathname !== "/loading") {
    newResponse.headers.set("X-Frame-Options", "SAMEORIGIN");
  }

  newResponse.headers.set(
    "Content-Security-Policy",
    "default-src 'self';" +
      "connect-src 'self' blob: https://skanderbeg.pm/api.php https://a.pdx.tools/api/event https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.10.0/;" +
      "img-src 'self' data:;" +
      // unsafe-eval needed for webassembly on safari (even though we don't
      // technically support safari)
      "script-src 'self' 'unsafe-eval' blob: https://a.pdx.tools/js/index.js;" +
      "style-src 'self' 'unsafe-inline'"
  );
  newResponse.headers.set("X-XSS-Protection", "1; mode=block");
  newResponse.headers.set("X-Content-Type-Options", "nosniff");
  newResponse.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  newResponse.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  return newResponse;
}

async function handleEvent(event: FetchEvent) {
  const parsedUrl = new URL(event.request.url);
  if (parsedUrl.pathname !== "/" && parsedUrl.pathname.endsWith("/")) {
    parsedUrl.pathname = parsedUrl.pathname.slice(0, -1);
    return Response.redirect(parsedUrl.toString(), 301);
  }

  const cacheControl = calcCacheControl(event);
  let resp = await getAssetFromKV(event, {
    mapRequestToAsset: assetRequest,
    cacheControl,
  });
  if (event.request.url.endsWith(".bin")) {
    // https://stackoverflow.com/a/64849685/433785
    resp = new Response(resp.body, {
      status: resp.status,
      headers: resp.headers,
      encodeBody: "manual",
    });
    resp.headers.set("Content-Encoding", "br");
    return resp;
  } else {
    return withSecurityHeaders(resp, parsedUrl.pathname);
  }
}

async function handleBlogEvent(event: FetchEvent) {
  let pathname = new URL(event.request.url).pathname;
  try {
    const cacheControl = calcCacheControl(event);
    const resp = await getAssetFromKV(event, {
      mapRequestToAsset,
      cacheControl,
    });
    return withSecurityHeaders(resp, pathname);
  } catch (e) {
    return new Response(`"${pathname}" not found`, {
      status: 404,
      statusText: "not found",
    });
  }
}
