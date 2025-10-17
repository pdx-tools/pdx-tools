import { pdxSession } from "@/server-lib/auth/session";
import { withCore } from "@/server-lib/middleware";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";

export const loader = withCore(
  async ({ request, context }: LoaderFunctionArgs) => {
    const session = await pdxSession({ request, context }).get();
    return Response.json(session);
  },
);
