import { saveView, table, toApiSave } from "@/server-lib/db";
import { sql, eq, lt, desc } from "drizzle-orm";
import { z } from "zod";
import { DbConnection } from "../db/connection";

const NewSchema = z.object({
  pageSize: z
    .number()
    .nullish()
    .transform((x) => x ?? 50),
  cursor: z.string().nullish(),
});

export async function getSaves(
  db: DbConnection,
  params: z.infer<typeof NewSchema>,
) {
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

  return { saves: result, cursor: cursorRes };
}
