import { dbPool, saveView, table, toApiSave } from "@/server-lib/db";
import { withCore } from "@/server-lib/middleware";
import { json } from "@tanstack/start";
import { createAPIFileRoute } from "@tanstack/start/api";
import { sql, eq, lt, desc } from "drizzle-orm";
import { z } from "zod";

const NewSchema = z.object({
  pageSize: z
    .number()
    .nullish()
    .transform((x) => x ?? 50),
  cursor: z.string().nullish(),
});
export const Route = createAPIFileRoute("/api/new")({
  GET: withCore(async ({ request }) => {
    const searchParams = new URL(request.url).searchParams;
    const params = NewSchema.parse(Object.fromEntries(searchParams.entries()));
    const db = dbPool().orm;

    const query = db
      .select(
        saveView({
          save: {
            players: sql<number>`cardinality(players)`,
          },
        }),
      )
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
    return json({ saves: result, cursor: cursorRes });
  }),
});
