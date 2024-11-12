import { getAdmin } from "@/server-lib/auth/session";
import { table } from "@/server-lib/db";
import { withDb } from "@/server-lib/db/middleware";
import { latestEu4MinorPatch } from "@/server-lib/game";
import { withCore } from "@/server-lib/middleware";
import { json, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { sql } from "drizzle-orm";

export const action = withCore(
  withDb(async ({ request, context }: LoaderFunctionArgs, { db }) => {
    await getAdmin({ request, context });

    const patch =
      new URL(request.url).searchParams.get("__patch_override_for_testing") ??
      latestEu4MinorPatch();

    await db
      .update(table.saves)
      .set({
        scoreDays: sql`days * (10 + (${+patch} - LEAST(save_version_second, ${+patch}))) / 10`,
      })
      .where(sql`cardinality(${table.saves.achieveIds}) != 0`);

    return json({ msg: "done" });
  }),
);
