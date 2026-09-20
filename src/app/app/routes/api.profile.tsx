import { isSessionStale, pdxSession } from "@/server-lib/auth/session";
import { withCore } from "@/server-lib/middleware";
import type { Route } from "./+types/api.profile";

export const loader = withCore(async ({ request, context }: Route.LoaderArgs) => {
  const storage = pdxSession({ request, context });
  const session = await storage.get();
  if (session.kind === "user" && isSessionStale(session)) {
    const refreshed = await storage.refresh(session);
    return Response.json(refreshed.session, { headers: { "Set-Cookie": refreshed.cookie } });
  }

  return Response.json(session);
});
