import { saveView, table, toApiSave } from "@/server-lib/db";
import { sql, eq } from "drizzle-orm";
import { NotFoundError } from "../errors";
import type { DbConnection } from "../db/connection";

export type SaveResponse = Awaited<ReturnType<typeof getSave>>;
export async function getSave(db: DbConnection, params: { saveId: string }) {
  const saves = await db
    .select(
      saveView({
        save: {
          aar: table.saves.aar,
          filename: table.saves.filename,
          players: sql<number>`cardinality(players)`,
        },
      }),
    )
    .from(table.saves)
    .where(eq(table.saves.id, params.saveId))
    .innerJoin(table.users, eq(table.users.userId, table.saves.userId));

  const save = saves.at(0);
  if (save === undefined) {
    throw new NotFoundError("save");
  }

  return { ...save.user, ...toApiSave(save.save) };
}
