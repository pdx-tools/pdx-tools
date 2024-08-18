import { withCore } from "@/server-lib/middleware";
import { DbRoute, fromParsedSave, withDb } from "@/server-lib/db";
import { table } from "@/server-lib/db";
import { eq } from "drizzle-orm";
import { ParsedFile } from "@/server-lib/save-parser";
import { log } from "@/server-lib/logging";
import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/server-lib/auth/middleware";

type ReprocessEntry = {
  saveId: string;
  save: Partial<ParsedFile>;
};

const handler = async (req: NextRequest, { dbConn }: DbRoute) => {
  const saves: ReprocessEntry[] = await req.json();
  const db = await dbConn;
  for (const save of saves) {
    const update = fromParsedSave(save.save);
    log.info({ saveId: save.saveId, msg: "updating to", update });
    await db
      .update(table.saves)
      .set(update)
      .where(eq(table.saves.id, save.saveId));
  }

  return NextResponse.json(null, { status: 204 });
};

export const POST = withCore(withAdmin(withDb(handler)));
