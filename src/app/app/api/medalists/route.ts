import {
  DbRoute,
  saveView,
  saveViews,
  table,
  toApiSave,
  userView,
  withDb,
} from "@/server-lib/db";
import { eu4DaysToDate } from "@/server-lib/game";
import { withCore } from "@/server-lib/middleware";
import { desc, eq, lte, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

const handler = async (_req: NextRequest, { dbConn }: DbRoute) => {
  const db = await dbConn;

  const {
    save: { id, patch, difficulty, date, upload_time },
  } = saveView();
  const unnested = db
    .select({
      id,
      achieve: sql<number>`UNNEST(${sql.raw(table.saves.achieveIds.name)})`.as(
        "achieve",
      ),
      user_id: table.saves.userId,
      playthrough_id: table.saves.playthroughId,
      score_days: table.saves.scoreDays,
      upload_time,
      date,
      difficulty,
      patch: saveViews.effectivePatch.as("patch"),
    })
    .from(table.saves)
    .as("unnested");

  const playthroughRanks = db
    .select({
      id: unnested.id,
      achieve: unnested.achieve,
      user_id: unnested.user_id,
      upload_time: unnested.upload_time,
      playthrough_id: unnested.playthrough_id,
      score_days: unnested.score_days,
      date: unnested.date,
      patch: unnested.patch,
      difficulty: unnested.difficulty,
      rn: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${sql.raw(unnested.achieve.fieldAlias)}, ${sql.raw(unnested.playthrough_id.name)} ORDER BY ${sql.raw(unnested.score_days.name)})`.as(
        "rn",
      ),
    })
    .from(unnested)
    .as("playthroughRanks");

  const bestInPlaythrough = db
    .select({
      id: playthroughRanks.id,
      achieve: playthroughRanks.achieve,
      user_id: playthroughRanks.user_id,
      upload_time: playthroughRanks.upload_time,
      score_days: playthroughRanks.score_days,
      playthrough_id: playthroughRanks.playthrough_id,
      date: playthroughRanks.date,
      patch: playthroughRanks.patch,
      difficulty: playthroughRanks.difficulty,
      achieve_rank:
        sql<number>`ROW_NUMBER() OVER (PARTITION BY achieve ORDER BY score_days, created_on)`.as(
          "achieve_rank",
        ),
    })
    .from(playthroughRanks)
    .where(eq(playthroughRanks.rn, sql.raw("1")))
    .orderBy(desc(sql`created_on`))
    .as("bestInPlaythrough");

  const topThree = db
    .select()
    .from(bestInPlaythrough)
    .where(lte(bestInPlaythrough.achieve_rank, sql.raw("3")))
    .as("topThree");

  const rows = await db
    .select({
      user_id: topThree.user_id,
      user_name: userView.userName.as("user_name"),
      saves: sql<
        {
          achievement: number;
          id: string;
          rank: number;
          upload_time: Date;
          score_days: number;
          date: string;
          difficulty: (typeof table.saves.$inferSelect)["gameDifficulty"];
          patch: string;
        }[]
      >`
            jsonb_agg(jsonb_build_object(
                'achievement', achieve,
                'id', id,
                'upload_time', "topThree"."created_on",
                'rank', achieve_rank,
                'score_days', score_days,
                'date', date,
                'difficulty', game_difficulty,
                'patch', patch
            ) ORDER BY achieve_rank ASC, "topThree"."created_on" DESC) 
        `.as("saves"),
      golds: sql<number>`COUNT(CASE WHEN achieve_rank = 1 THEN 1 END)`.as(
        "golds",
      ),
      silvers: sql<number>`COUNT(CASE WHEN achieve_rank = 2 THEN 1 END)`.as(
        "silvers",
      ),
      bronzes: sql<number>`COUNT(CASE WHEN achieve_rank = 3 THEN 1 END)`.as(
        "bronzes",
      ),
    })
    .from(topThree)
    .groupBy(topThree.user_id, sql`user_name`)
    .innerJoin(table.users, eq(table.users.userId, topThree.user_id))
    .orderBy(desc(sql`golds`), desc(sql`silvers`), desc(sql`bronzes`))
    .limit(10);

  return NextResponse.json({
    medalists: rows.map((medalist) => ({
      ...medalist,
      saves: medalist.saves.map(({ score_days, ...save }) => ({
        ...toApiSave(save),
        weighted_score: {
          days: score_days,
          date: eu4DaysToDate(score_days),
        },
      })),
    })),
  });
};

export type MedalistResponse =
  Awaited<ReturnType<typeof handler>> extends NextResponse<infer T> ? T : never;

export const GET = withCore(withDb(handler));
