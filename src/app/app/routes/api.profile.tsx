import { pdxSession } from "@/server-lib/auth/session";
import { withCore } from "@/server-lib/middleware";
import type { Route } from "./+types/api.profile";

export const loader = withCore(
  async ({ request, context }: Route.LoaderArgs) => {
    const session = await pdxSession({ request, context }).get();
    return Response.json(session);
  },
);
