import { withCore } from "@/server-lib/middleware";
import { DbRoute, saveView, table, toApiSave, withDb } from "@/server-lib/db";
import { eq, lt, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const NewSchema = z.object({
  pageSize: z
    .number()
    .nullish()
    .transform((x) => x ?? 50),
  cursor: z.string().nullish(),
});

const handler = async (
  _req: NextRequest,
  { dbConn, searchParams }: DbRoute & { searchParams: URLSearchParams },
) => {
  const params = NewSchema.parse(Object.fromEntries(searchParams.entries()));
  const db = await dbConn;

  const query = db
    .select(saveView())
    .from(table.saves)
    .innerJoin(table.users, eq(table.users.userId, table.saves.userId));

  let cursorQuery = params.cursor
    ? query.where(
        lt(
          table.saves.createdOn,
          db
            .select({ createdOn: table.saves.createdOn })
            .from(table.saves)
            .where(eq(table.saves.id, params.cursor)),
        ),
      )
    : query;

  const saves = await cursorQuery
    .orderBy(desc(table.saves.createdOn))
    .limit(params.pageSize);
  const result = saves.map(({ user, save }) => ({
    ...user,
    ...toApiSave(save),
  }));
  const cursorRes =
    result.length < params.pageSize ? undefined : result.at(-1)?.id;
  return NextResponse.json({ saves: result, cursor: cursorRes });
};

export type NewestSaveResponse =
  Awaited<ReturnType<typeof handler>> extends NextResponse<infer T> ? T : never;

export const GET = (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  return withCore(withDb(handler))(req, { searchParams });
};
