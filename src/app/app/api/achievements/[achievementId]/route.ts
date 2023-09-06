import { ValidationError } from "@/server-lib/errors";
import { getAchievement } from "@/server-lib/game";
import { AchievementView } from "@/services/appApi";
import { withCore } from "@/server-lib/middleware";
import { DbRoute, table, toApiSave, withDb } from "@/server-lib/db";
import { sql, eq, asc, inArray } from "drizzle-orm";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

const paramSchema = z.object({ achievementId: z.coerce.number() });
const handler = async (
  _req: NextRequest,
  { params, dbConn }: DbRoute & { params: { achievementId: unknown } },
) => {
  const achieveId = paramSchema.parse(params).achievementId;
  const achievement = getAchievement(achieveId);
  if (achievement === undefined) {
    throw new ValidationError("achievement not found");
  }

  const db = await dbConn;
  const saves = await db
    .select({
      id: table.saves.id,
      playthroughId: table.saves.playthroughId,
      rank: sql<number>`RANK() OVER(
        ORDER BY score_days, created_on ASC
      )`,
    })
    .from(table.saves)
    .where(sql`${table.saves.achieveIds} @> Array[${[achieveId]}]::int[]`);

  const playthroughIds = new Set();
  const outSaves: string[] = [];

  for (const save of saves) {
    if (playthroughIds.has(save.playthroughId)) {
      continue;
    }

    playthroughIds.add(save.playthroughId);
    outSaves.push(save.id);
  }

  const result =
    outSaves.length > 0
      ? await db
          .select()
          .from(table.saves)
          .innerJoin(table.users, eq(table.users.userId, table.saves.userId))
          .where(inArray(table.saves.id, outSaves))
          .orderBy(asc(table.saves.scoreDays))
      : [];

  return NextResponse.json<AchievementView>({
    achievement: {
      ...achievement,
    },
    saves: result.map((x) => toApiSave(x)),
  });
};

export const GET = withCore(withDb(handler));
