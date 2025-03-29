import { getAuth } from "@/server-lib/auth/session";
import { fromParsedSave, table } from "@/server-lib/db";
import { withDb } from "@/server-lib/db/middleware";
import { log } from "@/server-lib/logging";
import { withCore } from "@/server-lib/middleware";
import { ParsedFile } from "@/server-lib/functions";
import { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { ensurePermissions } from "@/lib/auth";

type ReprocessEntry = {
  saveId: string;
  save: Partial<ParsedFile>;
};

export const action = withCore(
  withDb(async ({ request, context }: LoaderFunctionArgs, { db }) => {
    const session = await getAuth({ request, context });
    ensurePermissions(session, "savefile:reprocess");

    const saves: ReprocessEntry[] = await request.json();
    for (const save of saves) {
      const update = fromParsedSave(save.save);
      log.info({ saveId: save.saveId, msg: "updating to", update });
      await db
        .update(table.saves)
        .set(update)
        .where(eq(table.saves.id, save.saveId));
    }

    return Response.json({ msg: "done" });
  }),
);
