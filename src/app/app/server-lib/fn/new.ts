import { saveView, table, toApiSave } from "@/server-lib/db";
import { sql, eq, lt, desc } from "drizzle-orm";
import { z } from "zod";
import type { DbConnection } from "../db/connection";

export const NewSchema = z.object({
  pageSize: z
    .number()
    .nullish()
    .transform((x) => x ?? 50),
  cursor: z.string().nullish(),
});

export async function getSaves(db: DbConnection, params: z.infer<typeof NewSchema>) {
  const query = db
    .select(
      saveView({
        save: {
          players: sql<number>`cardinality(players)`,
        },
      }),
    )
    .from(table.eu4Saves)
    .innerJoin(table.users, eq(table.users.userId, table.eu4Saves.userId));

  const cursorQuery = params.cursor
    ? query.where(
        lt(
          table.eu4Saves.createdOn,
          db
            .select({ createdOn: table.eu4Saves.createdOn })
            .from(table.eu4Saves)
            .where(eq(table.eu4Saves.id, params.cursor)),
        ),
      )
    : query;

  const saves = await cursorQuery.orderBy(desc(table.eu4Saves.createdOn)).limit(params.pageSize);
  const result = saves.map(({ user, save }) => ({
    ...user,
    ...toApiSave(save),
  }));
  const cursorRes = result.length < params.pageSize ? undefined : result.at(-1)?.id;

  return { saves: result, cursor: cursorRes };
}
