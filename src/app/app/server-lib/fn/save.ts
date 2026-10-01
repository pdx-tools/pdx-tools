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
          aar: table.eu4Saves.aar,
          filename: table.eu4Saves.filename,
          players: sql<number>`cardinality(players)`,
        },
      }),
    )
    .from(table.eu4Saves)
    .where(eq(table.eu4Saves.id, params.saveId))
    .innerJoin(table.users, eq(table.users.userId, table.eu4Saves.userId));

  const save = saves.at(0);
  if (save === undefined) {
    throw new NotFoundError("save");
  }

  return { ...save.user, ...toApiSave(save.save) };
}
