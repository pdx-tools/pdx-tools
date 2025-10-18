import { ensurePermissions } from "@/lib/auth";
import { getAuth } from "@/server-lib/auth/session";
import { table } from "@/server-lib/db";
import { withDb } from "@/server-lib/db/middleware";
import { latestEu4MinorPatch } from "@/server-lib/game";
import { withCore } from "@/server-lib/middleware";
import { isNotNull, sql } from "drizzle-orm";
import type { Route } from "./+types/api.admin.rebalance";

export const action = withCore(
  withDb(async ({ request, context }: Route.ActionArgs, { db }) => {
    const session = await getAuth({ request, context });
    ensurePermissions(session, "leaderboard:rebalance");

    const patch =
      new URL(request.url).searchParams.get("__patch_override_for_testing") ??
      latestEu4MinorPatch();

    await db
      .update(table.saves)
      .set({
        scoreDays: sql`days * (10 + (${+patch} - LEAST(save_version_second, ${+patch}))) / 10`,
      })
      .where(isNotNull(table.saves.scoreDays));

    return Response.json({ msg: "done" });
  }),
);
