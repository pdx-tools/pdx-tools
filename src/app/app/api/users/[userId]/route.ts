import dayjs from "dayjs";
import { withCore } from "@/server-lib/middleware";
import { DbRoute, saveView, table, toApiSave, withDb } from "@/server-lib/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { NotFoundError } from "@/server-lib/errors";

const paramSchema = z.object({ userId: z.string() });
const handler = async (
  _req: NextRequest,
  { dbConn, ...ctx }: { params: unknown } & DbRoute,
) => {
  const params = paramSchema.parse(ctx.params);
  const db = await dbConn;

  const userSaves = await db
    .select(
      saveView({
        save: {
          filename: table.saves.filename,
          playthrough_id: table.saves.playthroughId,
          days: table.saves.days,
        },
        user: {
          created_on: table.users.createdOn,
        },
      }),
    )
    .from(table.saves)
    .rightJoin(table.users, eq(table.users.userId, table.saves.userId))
    .where(eq(table.users.userId, params.userId))
    .orderBy(desc(table.saves.createdOn));

  const firstRow = userSaves.at(0);
  if (firstRow === undefined) {
    throw new NotFoundError("user");
  }

  const saves = userSaves
    .map((x) => x.save)
    .filter((x) => x !== null)
    .map(toApiSave);
  const result = {
    user_info: {
      created_on: dayjs(firstRow.user.created_on).toISOString(),
      user_id: firstRow.user.user_id,
      user_name: firstRow.user.user_name,
    },
    saves,
  };

  return NextResponse.json(result);
};

export type UserResponse =
  Awaited<ReturnType<typeof handler>> extends NextResponse<infer T> ? T : never;

export const GET = withCore(withDb(handler));
