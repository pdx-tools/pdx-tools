import type { ActionFunction, LoaderFunction } from "@remix-run/cloudflare";

const API_HOST = "eu.i.posthog.com";
const ASSET_HOST = "eu-assets.i.posthog.com";

// https://posthog.com/docs/advanced/proxy/remix
const posthogProxy = async (request: Request) => {
  const url = new URL(request.url);
  const hostname = url.pathname.startsWith("/ph/static/")
    ? ASSET_HOST
    : API_HOST;

  const newUrl = new URL(url);
  newUrl.protocol = "https";
  newUrl.hostname = hostname;
  newUrl.port = "443";
  newUrl.pathname = newUrl.pathname.replace(/^\/ph/, "");

  const headers = new Headers(request.headers);
  headers.set("host", hostname);

  return fetch(newUrl, {
    method: request.method,
    headers,

    // Disable lint using a body in GET requests as this is from the PostHog docs.
    // oxlint-disable-next-line no-invalid-fetch-options
    body: request.body,
    duplex: "half",
  });
};

export const loader: LoaderFunction = async ({ request }) =>
  posthogProxy(request);

export const action: ActionFunction = async ({ request }) =>
  posthogProxy(request);
