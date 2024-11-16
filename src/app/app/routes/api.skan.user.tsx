import { getAuth } from "@/server-lib/auth/session";
import { table } from "@/server-lib/db";
import { withDb } from "@/server-lib/db/middleware";
import { log } from "@/server-lib/logging";
import { withCore } from "@/server-lib/middleware";
import { SkanUserSaves } from "@/services/appApi";
import { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";

export const loader = withCore(
  withDb(async ({ request, context }: LoaderFunctionArgs, { db }) => {
    const session = await getAuth({ request, context });
    const apiKey = context.cloudflare.env.SKAN_API_KEY;

    const query = await db
      .select({ steamId: table.users.steamId })
      .from(table.users)
      .where(eq(table.users.userId, session.id));
    const steamId = query[0]?.steamId;
    if (!steamId) {
      return Response.json(
        { msg: "user does not have associated steam account" },
        { status: 404 },
      );
    }

    const params = new URLSearchParams({
      key: apiKey,
      scope: "fetchUserSaves",
      steamid: steamId,
    });
    const url = `https://skanderbeg.pm/api.php?` + params;
    log.info({ skanderbeg: url });
    const skanResponse = await fetch(url);
    const skanJson = await skanResponse.json();

    // If skanderbeg returns a string then it means an error message
    // This is intended according to jarvin: "Outputting an actual error message seems to be a
    // less confusing approach than outputting an empty array"
    if (typeof skanJson === "string") {
      return Response.json([]);
    } else {
      return Response.json(skanJson as SkanUserSaves[]);
    }
  }),
);
