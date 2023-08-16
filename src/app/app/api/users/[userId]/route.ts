import dayjs from "dayjs";
import { withCore } from "@/server-lib/middleware";
import { SaveFile, UserSaves } from "@/services/appApi";
import { DbRoute, table, toApiSaveUser, withDb } from "@/server-lib/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

const paramSchema = z.object({ userId: z.string() });
const handler = async (
  _req: NextRequest,
  { dbConn, ...ctx }: { params: unknown } & DbRoute,
) => {
  const params = paramSchema.parse(ctx.params);
  const db = await dbConn;
  const usersSaves = await db
    .select()
    .from(table.saves)
    .rightJoin(table.users, eq(table.users.userId, table.saves.userId))
    .where(eq(table.users.userId, params.userId))
    .orderBy(desc(table.saves.createdOn));

  const user = usersSaves[0]?.users;
  if (!user) {
    return NextResponse.json({ msg: "user does not exist" }, { status: 404 });
  }

  const saves = usersSaves.reduce<SaveFile[]>((acc, row) => {
    if (row.saves !== null) {
      acc.push(toApiSaveUser(row.saves, user));
    }

    return acc;
  }, []);

  const result: UserSaves = {
    user_info: {
      created_on: dayjs(user.createdOn).toISOString(),
      user_id: user.userId,
      user_name: user.display || user.steamName || "unknown",
    },
    saves,
  };

  return NextResponse.json(result);
};

export const GET = withCore(withDb(handler));
