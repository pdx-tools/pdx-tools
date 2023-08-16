import { latestEu4MinorPatch } from "@/server-lib/game";
import { DbRoute, table, withDb } from "@/server-lib/db";
import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { withCore } from "@/server-lib/middleware";
import { withAdmin } from "@/server-lib/auth/middleware";

const handler = async (req: NextRequest, { dbConn }: DbRoute) => {
  const db = await dbConn;
  const patch =
    new URL(req.url).searchParams.get("__patch_override_for_testing") ??
    latestEu4MinorPatch();

  await db
    .update(table.saves)
    .set({
      scoreDays: sql`days * (10 + (${+patch} - LEAST(save_version_second, ${+patch}))) / 10`,
    })
    .where(sql`cardinality(${table.saves.achieveIds}) != 0`);

  return NextResponse.json({ msg: "done" });
};

export const POST = withCore(withAdmin(withDb(handler)));
