import { pdxCookieSession } from "@/server-lib/auth/cookie";
import { withCore } from "@/server-lib/middleware";
import { LoaderFunctionArgs } from "@remix-run/cloudflare";

export const loader = withCore(
  async ({ request, context }: LoaderFunctionArgs) => {
    const session = await pdxCookieSession({ request, context }).get();
    return Response.json(session);
  },
);
