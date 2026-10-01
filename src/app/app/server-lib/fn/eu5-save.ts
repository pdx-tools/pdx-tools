import { table, userView } from "@/server-lib/db";
import { eq } from "drizzle-orm";
import { NotFoundError } from "../errors";
import type { DbConnection } from "../db/connection";

export type Eu5SaveResponse = Awaited<ReturnType<typeof getEu5Save>>;

export async function getEu5Save(db: DbConnection, params: { saveId: string }) {
  const rows = await db
    .select({
      id: table.eu5Saves.id,
      filename: table.eu5Saves.filename,
      user_id: table.eu5Saves.userId,
      user_name: userView.userName,
      upload_time: table.eu5Saves.createdOn,
      date: table.eu5Saves.date,
      playthrough_name: table.eu5Saves.playthroughName,
      version_major: table.eu5Saves.versionMajor,
      version_minor: table.eu5Saves.versionMinor,
      version_patch: table.eu5Saves.versionPatch,
    })
    .from(table.eu5Saves)
    .innerJoin(table.users, eq(table.users.userId, table.eu5Saves.userId))
    .where(eq(table.eu5Saves.id, params.saveId));

  const save = rows.at(0);
  if (!save) throw new NotFoundError("EU5 save");
  return { ...save, upload_time: save.upload_time.toISOString() };
}
