import { type ActionFunctionArgs } from "@remix-run/cloudflare";

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

  // https://github.com/getsentry/sentry-javascript/discussions/5798#discussioncomment-3711950
  // https://developers.cloudflare.com/fundamentals/reference/http-request-headers/#x-forwarded-for
  const headers = new Headers();
  const forwardedHeader = "X-Forwarded-For";
  const forwardedIp = request.headers.get(forwardedHeader);
  if (forwardedIp) {
    headers.set(forwardedHeader, forwardedIp);
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
