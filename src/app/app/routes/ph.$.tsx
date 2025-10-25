import type { Route } from "./+types/ph.$";

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

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    // Disable lint using a body in GET requests as this is from the PostHog docs.
    // oxlint-disable-next-line no-invalid-fetch-options
    body: request.body as BodyInit | null,
  };
  init.duplex = "half";

  return fetch(newUrl, init);
};

export const loader = async ({ request }: Route.LoaderArgs) =>
  posthogProxy(request);

export const action = async ({ request }: Route.ActionArgs) =>
  posthogProxy(request);
