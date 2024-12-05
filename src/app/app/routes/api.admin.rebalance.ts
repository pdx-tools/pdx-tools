import { ensurePermissions } from "@/lib/auth";
import { getSessionUser } from "@/server-lib/auth/user";
import { table } from "@/server-lib/db";
import { withDb } from "@/server-lib/db/middleware";
import { latestEu4MinorPatch } from "@/server-lib/game";
import { withCore } from "@/server-lib/middleware";
import { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { sql } from "drizzle-orm";

export const action = withCore(
  withDb(async ({ request, context }: LoaderFunctionArgs, { db }) => {
    const session = await getSessionUser({ request, context });
    ensurePermissions(session, "leaderboard:rebalance");

    const patch =
      new URL(request.url).searchParams.get("__patch_override_for_testing") ??
      latestEu4MinorPatch();

    await db
      .update(table.saves)
      .set({
        scoreDays: sql`days * (10 + (${+patch} - LEAST(save_version_second, ${+patch}))) / 10`,
      })
      .where(sql`cardinality(${table.saves.achieveIds}) != 0`);

    return Response.json({ msg: "done" });
  }),
);
