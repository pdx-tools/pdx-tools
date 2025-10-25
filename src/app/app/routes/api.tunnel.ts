import type { ActionFunctionArgs } from "@remix-run/cloudflare";

export async function action({ request, context }: ActionFunctionArgs) {
  const body = await request.text();
  const [piece] = body.split("\n");
  const header = JSON.parse(piece) as { dsn: string };
  const dsn = new URL(header.dsn);
  const project_id = dsn.pathname.replace("/", "");

  if (dsn.hostname !== context.cloudflare.env.SENTRY_HOST) {
    throw new Response(`Invalid sentry hostname: ${dsn.hostname}`, {
      status: 400,
      statusText: "Bad Request",
    });
  }

  if (project_id !== context.cloudflare.env.SENTRY_PROJECT_ID) {
    throw new Error(`Invalid sentry project id: ${project_id}`);
  }

  // https://community.cloudflare.com/t/ip-address-of-the-remote-origin-of-the-request/13080
  const headers = new Headers(request.headers);
  const clientIp = request.headers.get("CF-Connecting-IP");
  if (clientIp) {
    headers.set("X-Forwarded-For", clientIp);
  }

  return fetch(
    `https://${context.cloudflare.env.SENTRY_HOST}/api/${project_id}/envelope/`,
    {
      method: "POST",
      body,
      headers,
    },
  );
}
