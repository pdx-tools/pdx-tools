import { fromParsedSave, table } from "@/server-lib/db";
import { withDb } from "@/server-lib/db/middleware";
import { log } from "@/server-lib/logging";
import { withCore } from "@/server-lib/middleware";
import { ParsedFile } from "@/server-lib/functions";
import { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { ensurePermissions } from "@/lib/auth";
import { getSessionUser } from "@/server-lib/auth/user";

type ReprocessEntry = {
  saveId: string;
  save: Partial<ParsedFile>;
};

export const loader = withCore(
  withDb(async ({ request, context }: LoaderFunctionArgs, { db }) => {
    const session = await getSessionUser({ request, context });
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

    return Response.json(null, { status: 204 });
  }),
);
