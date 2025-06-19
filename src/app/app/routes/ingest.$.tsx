import type { Route } from "./+types/ingest.$";

const API_HOST = "eu.i.posthog.com";
const ASSET_HOST = "eu-assets.i.posthog.com";

// https://posthog.com/docs/advanced/proxy/remix
const posthogProxy = async (request: Request) => {
  const url = new URL(request.url);
  const hostname = url.pathname.startsWith("/ingest/static/")
    ? ASSET_HOST
    : API_HOST;

  const newUrl = new URL(url);
  newUrl.protocol = "https";
  newUrl.hostname = hostname;
  newUrl.port = "443";
  newUrl.pathname = newUrl.pathname.replace(/^\/ingest/, "");

  const headers = new Headers(request.headers);
  headers.set("host", hostname);

  return fetch(newUrl, {
    method: request.method,
    headers,
    body: request.body,
    duplex: "half",
  } as RequestInit);
};

export const loader = async ({ request }: Route.LoaderArgs) =>
  posthogProxy(request);

export const action = async ({ request }: Route.ActionArgs) =>
  posthogProxy(request);
